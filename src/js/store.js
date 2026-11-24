/* Estado e regras de negócio: clientes, mensalidades (com histórico por mês), atividades e configurações. */
(function (V) {
  'use strict';
  const U = V.util, C = V.cal;

  const DEFAULT_PIX = ''; // Chave PIX da agência: definir em Configurações (não versionada)
  const DEFAULT_SETTINGS = {
    agencyName: 'Agência Vulpes',
    shortName: 'Vulpes',
    pixKey: DEFAULT_PIX,
    cnpj: '',
    agencyPhone: '',
    agencyEmail: '',
    soonDays: 5,
    bankDays: true,
    templates: {},
  };

  /* Clientes iniciais. Usados apenas quando o app roda com o armazenamento local e ainda está vazio;
   * na versão publicada eles foram gravados uma única vez no banco. */
  const SEED_START = '2026-11';
  const CONTACTS = {}; // Contatos reais ficam só no banco de dados, fora do repositório
  const SEED_CLIENTS = [
    // Clientes iniciais reais não são versionados. Exemplo fictício: ['Cliente Exemplo', 1000, 'fixed', 10, 'pix'],
  ].map(([name, amount, dueRule, dueDay, paymentMethod]) => ({
    id: 'c_' + U.slug(name), name, contactName: CONTACTS[name] || '', amount, dueRule, dueDay, paymentMethod,
    pixKey: paymentMethod === 'pix' ? DEFAULT_PIX : '', phone: '', status: 'ativo', notes: '',
    startMonth: SEED_START, createdAt: '2026-11-24T12:00:00.000Z',
  }));

  const STATUS = {
    aguardando: 'Aguardando pagamento',
    pago: 'Pago',
    atraso: 'Em atraso',
    enviada: 'Cobrança enviada',
  };

  const state = {
    ready: false,
    storageKind: null,
    error: null,
    loaded: { clients: false, charges: false, activity: false, settings: false, jobs: false, expenses: false, expenseEntries: false, settlements: false },
    clients: [],
    charges: [],
    jobs: [],
    expenses: [],
    expenseEntries: [],
    settlements: [],
    activity: [],
    settingsDoc: null,
  };
  let repo = null;
  const subs = new Set();
  function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }
  function notify() { subs.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } }); }

  function settings() {
    const s = Object.assign({}, DEFAULT_SETTINGS, state.settingsDoc || {});
    s.templates = Object.assign({}, V.messaging.DEFAULT_TEMPLATES, (state.settingsDoc && state.settingsDoc.templates) || {});
    return s;
  }

  /* ---------- Consultas ---------- */
  const clientById = (id) => state.clients.find((c) => c.id === id) || null;
  const activeClients = () => state.clients.filter((c) => c.status === 'ativo');
  /** Clientes ativos com mensalidade recorrente (clientes "só jobs" ficam de fora). */
  const retainerClients = () => activeClients().filter((c) => c.hasRetainer !== false);
  const chargesOf = (month) => state.charges.filter((c) => c.month === month);
  const chargeId = (clientId, month) => clientId + '_' + month;

  function isOverdue(ch, ref) { return ch.status !== 'pago' && !!ch.dueDate && ch.dueDate < (ref || U.today()); }
  /** Status exibido: "aguardando" vencido aparece como "em atraso" automaticamente. */
  function effStatus(ch, ref) {
    if (ch.status === 'pago') return 'pago';
    if (ch.status === 'enviada') return 'enviada';
    if (ch.status === 'atraso') return 'atraso';
    return isOverdue(ch, ref) ? 'atraso' : 'aguardando';
  }
  /** Para a Central de Cobranças: precisa de um lembrete de atraso? */
  function needsLateFollowUp(ch, ref) {
    if (!isOverdue(ch, ref)) return false;
    if (ch.status === 'enviada' && ch.sentKind === 'atraso') return false;
    return true;
  }

  function monthSummary(month) {
    const t = U.today();
    const list = chargesOf(month);
    const sum = (arr, f) => arr.reduce((a, c) => a + (Number(f ? f(c) : c.amount) || 0), 0);
    const paid = list.filter((c) => c.status === 'pago');
    const late = list.filter((c) => isOverdue(c, t));
    const pending = list.filter((c) => c.status !== 'pago' && !isOverdue(c, t));
    return {
      list,
      expected: sum(list),
      received: sum(paid, (c) => (c.paidAmount != null ? c.paidAmount : c.amount)),
      pending: sum(pending), pendingCount: pending.length,
      late: sum(late), lateCount: late.length,
      paidCount: paid.length,
    };
  }
  function allOverdue() { const t = U.today(); return state.charges.filter((c) => isOverdue(c, t)); }

  /* ---------- Escrita ---------- */
  async function guard(promise, okMsg) {
    try { await promise; if (okMsg) V.ui.toast(okMsg); return true; } catch (e) {
      console.error(e);
      const code = e && e.code;
      const msg = code === 'quota_exceeded' ? 'O limite de armazenamento foi atingido. Exporte um backup e limpe atividades antigas.'
        : code === 'invalid_argument' ? 'Você não tem permissão para alterar estes dados ou o registro não existe mais.'
        : 'Não foi possível salvar agora. Verifique a conexão e tente de novo.';
      V.ui.toast(msg, true);
      return false;
    }
  }

  function log(type, text, extra) {
    const id = 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const doc = Object.assign({ type, text, at: new Date().toISOString() }, extra || {});
    repo.set('activity', id, doc).catch((e) => console.warn('activity', e));
    // Mantém o histórico de atividades enxuto (as mensalidades guardam o histórico financeiro).
    if (state.activity.length > 400) {
      state.activity.slice().sort((a, b) => (a.at < b.at ? -1 : 1)).slice(0, state.activity.length - 400)
        .forEach((a) => repo.remove('activity', a.id).catch(() => {}));
    }
  }

  function buildCharge(client, month) {
    const s = settings();
    const now = new Date().toISOString();
    return {
      clientId: client.id, clientName: client.name, month,
      amount: Number(client.amount) || 0,
      dueDate: C.dueDateFor(client, month, s.bankDays),
      dueRule: client.dueRule, dueDay: Number(client.dueDay) || null,
      paymentMethod: client.paymentMethod,
      status: 'aguardando', paidAt: null, paidAmount: null, sentAt: null, sentKind: null, sentCount: 0, notes: '',
      createdAt: now, updatedAt: now,
    };
  }

  /* Gera (uma vez) as mensalidades de cada cliente ativo, do mês de início até o próximo mês.
   * Mensalidades já existentes nunca são sobrescritas: é isso que preserva o histórico. */
  const creating = new Set();
  function ensureCharges() {
    if (!state.loaded.clients || !state.loaded.charges || !state.loaded.settings) return;
    const cur = U.currentYm();
    const last = U.addMonths(cur, 1);
    const oldest = U.addMonths(cur, -24);
    const have = new Set(state.charges.map((c) => c.id));
    retainerClients().forEach((client) => {
      let m = client.startMonth && client.startMonth > oldest ? client.startMonth : (client.startMonth ? oldest : cur);
      for (let i = 0; i < 40 && m <= last; i++, m = U.addMonths(m, 1)) {
        const id = chargeId(client.id, m);
        if (have.has(id) || creating.has(id)) continue;
        creating.add(id);
        repo.set('charges', id, buildCharge(client, m)).catch((e) => console.warn('charge', e)).finally(() => creating.delete(id));
      }
    });
  }

  async function saveClient(data) {
    const isNew = !data.id;
    const id = data.id || 'c_' + U.slug(data.name) + '-' + Date.now().toString(36).slice(-4);
    const prev = clientById(id);
    const s = settings();
    const doc = {
      name: data.name.trim(), contactName: (data.contactName || '').trim(), amount: U.parseMoney(data.amount),
      dueRule: data.dueRule === 'bd5' ? 'bd5' : 'fixed', dueDay: data.dueRule === 'bd5' ? 5 : Math.min(31, Math.max(1, Number(data.dueDay) || 1)),
      paymentMethod: data.paymentMethod === 'pix' ? 'pix' : 'boleto',
      pixKey: data.paymentMethod === 'pix' ? ((data.pixKey || '').trim() || s.pixKey) : '',
      phone: (data.phone || '').trim(), status: data.status === 'inativo' ? 'inativo' : 'ativo', notes: (data.notes || '').trim(),
      startMonth: data.startMonth || (prev && prev.startMonth) || U.currentYm(),
      hasRetainer: !(data.hasRetainer === false || data.hasRetainer === 'false'),
      createdAt: (prev && prev.createdAt) || new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    // Cliente reativado: não gera mensalidades retroativas do período em que esteve inativo.
    if (prev && prev.status === 'inativo' && doc.status === 'ativo' && doc.startMonth < U.currentYm()) doc.startMonth = U.currentYm();
    const ok = await guard(repo.set('clients', id, doc), data.silent ? null : (isNew ? 'Cliente cadastrado.' : 'Cliente atualizado.'));
    if (!ok) return null;
    log('client', (isNew ? 'Cliente cadastrado: ' : 'Cliente atualizado: ') + doc.name, { clientId: id });

    // Atualiza mensalidades ainda em aberto a partir do mês atual (meses anteriores ficam como estão).
    const cur = U.currentYm();
    const client = Object.assign({ id }, doc);
    for (const ch of state.charges.filter((c) => c.clientId === id && c.month >= cur && c.status !== 'pago')) {
      if (!doc.hasRetainer && ch.status === 'aguardando' && !ch.sentAt) { await repo.remove('charges', ch.id).catch(() => {}); continue; }
      if (doc.status === 'inativo' && ch.month > cur && ch.status === 'aguardando') { await repo.remove('charges', ch.id).catch(() => {}); continue; }
      const patch = {
        clientName: doc.name, amount: doc.amount, paymentMethod: doc.paymentMethod, dueRule: doc.dueRule, dueDay: doc.dueDay,
        dueDate: C.dueDateFor(client, ch.month, s.bankDays), updatedAt: new Date().toISOString(),
      };
      if (patch.clientName !== ch.clientName || patch.amount !== ch.amount || patch.paymentMethod !== ch.paymentMethod || patch.dueDate !== ch.dueDate) {
        await repo.update('charges', ch.id, patch).catch((e) => console.warn(e));
      }
    }
    return id;
  }

  async function deleteClient(id, keepHistory) {
    const c = clientById(id);
    if (!c) return;
    const ok = await guard(repo.remove('clients', id), 'Cliente excluído.');
    if (!ok) return;
    const cur = U.currentYm();
    for (const ch of state.charges.filter((x) => x.clientId === id)) {
      const futureOpen = ch.month > cur && ch.status !== 'pago';
      if (!keepHistory || futureOpen) await repo.remove('charges', ch.id).catch(() => {});
    }
    log('client', 'Cliente excluído: ' + c.name, { clientId: id });
  }

  async function setChargeStatus(id, status, opts) {
    const ch = state.charges.find((c) => c.id === id);
    if (!ch) return;
    opts = opts || {};
    const patch = { status, updatedAt: new Date().toISOString() };
    if (status === 'pago') {
      patch.paidAt = opts.paidAt || U.today();
      patch.paidAmount = opts.paidAmount != null ? U.parseMoney(opts.paidAmount) : ch.amount;
    } else {
      patch.paidAt = null; patch.paidAmount = null;
    }
    if (status === 'enviada') {
      patch.sentAt = new Date().toISOString();
      patch.sentKind = opts.sentKind || ch.sentKind || null;
      patch.sentCount = (ch.sentCount || 0) + 1;
    }
    const ok = await guard(repo.update('charges', id, patch));
    if (!ok) return false;
    const ref = ch.clientName + ' · ' + U.monthLabel(ch.month, { noYear: true });
    if (status === 'pago') {
      V.ui.toast('Pagamento registrado.');
      log('payment', 'Pagamento recebido de ' + ref, { clientId: ch.clientId, chargeId: id, amount: patch.paidAmount, date: patch.paidAt });
    } else if (status === 'enviada') {
      V.ui.toast('Cobrança marcada como enviada.');
      log('sent', 'Cobrança enviada para ' + ref + (opts.sentKind === 'atraso' ? ' (lembrete de atraso)' : ''), { clientId: ch.clientId, chargeId: id, amount: ch.amount });
    } else {
      V.ui.toast('Status atualizado: ' + STATUS[status] + '.');
      log('status', ref + ': ' + STATUS[status], { clientId: ch.clientId, chargeId: id });
    }
    return true;
  }

  async function updateCharge(id, fields) {
    const ch = state.charges.find((c) => c.id === id);
    if (!ch) return false;
    const patch = { updatedAt: new Date().toISOString() };
    if (fields.amount != null) patch.amount = U.parseMoney(fields.amount);
    if (fields.dueDate) patch.dueDate = fields.dueDate;
    if (fields.notes != null) patch.notes = fields.notes;
    if (fields.paidAt) patch.paidAt = fields.paidAt;
    if (fields.paidAmount != null && fields.paidAmount !== '') patch.paidAmount = U.parseMoney(fields.paidAmount);
    return guard(repo.update('charges', id, patch), 'Mensalidade atualizada.');
  }

  async function saveSettings(next) {
    const before = settings();
    const doc = Object.assign({}, state.settingsDoc || {}, next);
    // Só guarda os modelos que diferem do padrão, para que melhorias futuras nos padrões apareçam.
    if (doc.templates) {
      const t = {};
      Object.keys(doc.templates).forEach((k) => { if (doc.templates[k] && doc.templates[k] !== V.messaging.DEFAULT_TEMPLATES[k]) t[k] = doc.templates[k]; });
      doc.templates = t;
    }
    const ok = await guard(repo.set('settings', 'main', doc), 'Configurações salvas.');
    if (!ok) return false;
    const after = Object.assign({}, DEFAULT_SETTINGS, doc);
    // Chave PIX nova: atualiza clientes PIX que usavam a chave anterior.
    if (after.pixKey !== before.pixKey) {
      for (const c of state.clients.filter((x) => x.paymentMethod === 'pix' && (!x.pixKey || x.pixKey === before.pixKey))) {
        await repo.update('clients', c.id, { pixKey: after.pixKey }).catch(() => {});
      }
    }
    // Regra de dias úteis mudou: recalcula vencimentos em aberto do 5º dia útil a partir deste mês.
    if (after.bankDays !== before.bankDays) {
      const cur = U.currentYm();
      for (const ch of state.charges.filter((x) => x.dueRule === 'bd5' && x.month >= cur && x.status !== 'pago')) {
        const { y, m } = U.ymParts(ch.month);
        const d = C.nthBusinessDay(y, m, 5, after.bankDays);
        if (d !== ch.dueDate) await repo.update('charges', ch.id, { dueDate: d }).catch(() => {});
      }
    }
    log('settings', 'Configurações atualizadas');
    return true;
  }

  async function importBackup(data) {
    if (!data || !Array.isArray(data.clients) || !Array.isArray(data.charges)) throw new Error('Arquivo inválido');
    for (const c of data.clients) await repo.set('clients', c.id, c);
    for (const c of data.charges) await repo.set('charges', c.id, c);
    for (const j of (data.jobs || [])) await repo.set('jobs', j.id, j);
    for (const e of (data.expenses || [])) await repo.set('expenses', e.id, e);
    for (const e of (data.expenseEntries || [])) await repo.set('expenseEntries', e.id, e);
    for (const e of (data.settlements || [])) await repo.set('settlements', e.id, e);
    for (const e of (data.activity || [])) await repo.set('activity', e.id, e);
    if (data.settings) await repo.set('settings', 'main', data.settings);
    log('settings', 'Backup importado (' + data.clients.length + ' clientes, ' + data.charges.length + ' mensalidades)');
  }

  function exportBackup() {
    const strip = (o) => { const x = Object.assign({}, o); return x; };
    return {
      app: 'vulpes-financeiro', version: 2, exportedAt: new Date().toISOString(),
      clients: state.clients.map(strip), charges: state.charges.map(strip), jobs: state.jobs.map(strip), expenses: state.expenses.map(strip), expenseEntries: state.expenseEntries.map(strip), settlements: state.settlements.map(strip), activity: state.activity.map(strip), settings: Object.assign({}, DEFAULT_SETTINGS, state.settingsDoc || {}),
    };
  }

  /* ---------- Inicialização ---------- */
  async function init() {
    repo = await V.storage.connect({ clients: SEED_CLIENTS, expenses: V.expenses ? V.expenses.SEED_EXPENSES : [] });
    state.storageKind = repo.kind;
    const onErr = (col) => (e) => { console.error(col, e); state.error = e; notify(); };
    const handle = (col, apply) => (list, meta) => {
      apply(list);
      if (meta.definitive && !state.loaded[col]) state.loaded[col] = true;
      state.ready = state.loaded.clients && state.loaded.charges && state.loaded.jobs && state.loaded.expenses && state.loaded.expenseEntries && state.loaded.settlements;
      ensureCharges();
      if (V.expenses) V.expenses.ensureEntries();
      notify();
    };
    repo.subscribe('clients', handle('clients', (l) => { state.clients = l.sort((a, b) => U.norm(a.name).localeCompare(U.norm(b.name))); }), onErr('clients'));
    repo.subscribe('charges', handle('charges', (l) => { state.charges = l; }), onErr('charges'));
    repo.subscribe('jobs', handle('jobs', (l) => { state.jobs = l.sort((a, b) => ((a.contractDate || '') < (b.contractDate || '') ? 1 : -1)); }), onErr('jobs'));
    repo.subscribe('expenses', handle('expenses', (l) => { state.expenses = l.sort((a, b) => U.norm(a.name).localeCompare(U.norm(b.name))); }), onErr('expenses'));
    repo.subscribe('expenseEntries', handle('expenseEntries', (l) => { state.expenseEntries = l; }), onErr('expenseEntries'));
    repo.subscribe('settlements', handle('settlements', (l) => { state.settlements = l; }), onErr('settlements'));
    repo.subscribe('activity', handle('activity', (l) => { state.activity = l.sort((a, b) => (a.at < b.at ? 1 : -1)); }), onErr('activity'));
    repo.subscribe('settings', handle('settings', (l) => { state.settingsDoc = (l.find((d) => d.id === 'main') || null); }), onErr('settings'));
    // Se o servidor demorar, avisa sem travar a tela.
    setTimeout(() => { if (!state.ready) { state.slow = true; notify(); } }, 10000);
  }

  V.store = {
    state, init, onChange, settings, STATUS, DEFAULT_SETTINGS, SEED_CLIENTS,
    _repo: () => repo, guard, log, retainerClients,
    clientById, activeClients, chargesOf, isOverdue, effStatus, needsLateFollowUp, monthSummary, allOverdue,
    saveClient, deleteClient, setChargeStatus, updateCharge, saveSettings, importBackup, exportBackup,
  };
})(window.Vulpes = window.Vulpes || {});
