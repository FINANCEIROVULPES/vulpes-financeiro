/* DESPESAS (contas a pagar). Separadas de mensalidades e jobs.
 *
 * expenses        cadastro de despesas que se repetem: fixas, assinaturas e parcelamentos de equipamentos.
 * expenseEntries  lançamentos de cada mês (um por despesa recorrente e mês, id <despesaId>_<AAAA-MM>,
 *                 o que impede duplicar ao recarregar) e os gastos variáveis / compras eventuais avulsos.
 * settlements     acerto mensal entre as sócias (id <AAAA-MM>). É só uma transferência entre elas:
 *                 nunca entra como despesa nem no resultado da agência.
 *
 * Rateio: cada lançamento tem "quem paga" (payer). No mês, soma-se o que cada sócia pagou, divide-se o total
 * por dois e quem pagou menos transfere a diferença para quem pagou mais.
 */
(function (V) {
  'use strict';
  const U = V.util, S = V.store;

  const TYPES = {
    fixa: 'Fixa',
    assinatura: 'Assinatura',
    equipamento: 'Equipamento',
    parcela: 'Parcela',
    variavel: 'Variável',
    eventual: 'Compra eventual',
  };
  const ONE_OFF = new Set(['equipamento', 'variavel', 'eventual']);
  const PARTNERS = { karol: 'Karol', natasha: 'Natasha' };
  const SETTLE_STATUS = { pendente: 'Pendente', concluido: 'Concluído' };
  const SETTLE_DAY = 20;
  const RECURRING = new Set(['fixa', 'assinatura', 'parcela']);
  const METHODS = { pix: 'PIX', boleto: 'Boleto', cartao: 'Cartão', outro: 'Outro', '': 'Não informado' };
  const STATUS = { pendente: 'Pendente', pago: 'Pago', atraso: 'Em atraso', agendado: 'Agendado' };
  const CATEGORIES = ['Estrutura', 'Pessoal', 'Ferramentas e assinaturas', 'Equipamentos', 'Gastos variáveis', 'Impostos e taxas', 'Marketing', 'Outros'];
  const VARIABLE_CATEGORIES = ['Mercado', 'Água e café', 'Material de escritório', 'Equipamentos', 'Acessórios para gravação', 'Cabos, baterias e cartões', 'Manutenção de equipamentos', 'Transporte e deslocamentos', 'Alimentação em gravações', 'Outras compras'];

  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const monthsBetween = (a, b) => { const x = U.ymParts(a), y = U.ymParts(b); return (y.y - x.y) * 12 + (y.m - x.m); };

  /* Despesas iniciais da Vulpes (só para o modo offline; na versão publicada foram gravadas uma vez no banco).
   * Datas não informadas ficam vazias para preencher depois. Parcelas: o número informado vale para nov/2026. */
  const SEED_MONTH = '2026-11';
  const SEED_EXPENSES = [
    // Despesas reais não são versionadas. Exemplo fictício: ['e_exemplo', 'Aluguel', 'Estrutura', 'fixa', 1000, 10, 'karol'],
  ].map(([id, name, category, type, amount, dueDay, payer, cur, total]) => ({
    id, name, category, type, amount, dueDay, payer, paymentMethod: '', recurrence: 'mensal', startMonth: SEED_MONTH, status: 'ativa',
    installmentCurrent: cur || null, installmentTotal: total || null, notes: '', createdAt: '2026-11-24T17:30:00.000Z',
  }));

  /* ---------- Consultas ---------- */
  const expenseById = (id) => S.state.expenses.find((e) => e.id === id) || null;
  const entryById = (id) => S.state.expenseEntries.find((e) => e.id === id) || null;
  const entriesOf = (month) => S.state.expenseEntries.filter((e) => e.month === month);

  function isOverdue(en, ref) { return en.status !== 'pago' && !!en.dueDate && en.dueDate < (ref || U.today()); }
  function effStatus(en, ref) {
    if (en.status === 'pago') return 'pago';
    if (en.status === 'agendado') return 'agendado';
    if (en.status === 'atraso') return 'atraso';
    return isOverdue(en, ref) ? 'atraso' : 'pendente';
  }
  const paidValue = (en) => Number(en.paidAmount != null ? en.paidAmount : en.amount) || 0;
  /** Quem paga o lançamento: o do próprio lançamento ou, se não houver, o do cadastro da despesa. */
  function payerOf(en) {
    if (en.payer && PARTNERS[en.payer]) return en.payer;
    const exp = en.expenseId ? expenseById(en.expenseId) : null;
    return exp && PARTNERS[exp.payer] ? exp.payer : '';
  }
  const partnerName = (p) => PARTNERS[p] || 'Não definido';
  const other = (p) => (p === 'karol' ? 'natasha' : 'karol');
  const settleDate = (month) => month + '-' + U.pad(SETTLE_DAY);
  const settlementById = (month) => (S.state.settlements || []).find((x) => x.id === month) || null;

  /**
   * Fechamento do mês entre as sócias. Soma o que cada uma pagou (valor pago, ou o valor da conta se ainda
   * não foi marcada como paga), divide o total por 2 e calcula a transferência.
   * net > 0: Natasha deve a Karol; net < 0: Karol deve a Natasha.
   */
  function settlementCalc(month) {
    const list = entriesOf(month);
    const val = (e) => (e.status === 'pago' ? paidValue(e) : Number(e.amount) || 0);
    const by = { karol: [], natasha: [] }, unassigned = [];
    list.forEach((e) => { const p = payerOf(e); if (p) by[p].push(e); else unassigned.push(e); });
    const karol = round2(by.karol.reduce((a, e) => a + val(e), 0));
    const natasha = round2(by.natasha.reduce((a, e) => a + val(e), 0));
    const total = round2(karol + natasha);
    const share = round2(total / 2);
    const net = round2(karol - share);
    const amount = Math.abs(net);
    const debtor = net > 0.004 ? 'natasha' : net < -0.004 ? 'karol' : '';
    const rec = settlementById(month);
    const done = !!(rec && rec.status === 'concluido');
    const transferred = done ? round2(Number(rec.amount) || 0) * (rec.from === 'natasha' ? 1 : -1) : 0;
    const pending = round2(net - transferred);
    const changedAfter = done && rec.snapshot && (Math.abs(round2(rec.snapshot.total) - total) > 0.004 || Math.abs(round2(rec.snapshot.net) - net) > 0.004);
    return {
      month, date: settleDate(month), list, karol, natasha, total, share, net, amount, debtor,
      creditor: debtor ? other(debtor) : '', countK: by.karol.length, countN: by.natasha.length,
      unassigned, unassignedTotal: round2(unassigned.reduce((a, e) => a + val(e), 0)),
      openCount: list.filter((e) => payerOf(e) && e.status !== 'pago').length,
      record: rec, done, pending, changedAfter,
    };
  }
  /** Meses com lançamentos (mais recente primeiro) e saldo acumulado ainda não acertado até o mês atual. */
  function settlementHistory() {
    const months = Array.from(new Set(S.state.expenseEntries.map((e) => e.month).concat((S.state.settlements || []).map((x) => x.id)))).filter(Boolean).sort().reverse();
    const rows = months.map(settlementCalc);
    const cur = U.currentYm();
    const pendingNet = round2(rows.filter((r) => r.month <= cur).reduce((a, r) => a + r.pending, 0));
    return { rows, pendingNet, pendingDebtor: pendingNet > 0.004 ? 'natasha' : pendingNet < -0.004 ? 'karol' : '' };
  }

  function dueDateFor(exp, month) {
    if (!exp.dueDay) return '';
    const { y, m } = U.ymParts(month);
    return month + '-' + U.pad(Math.min(Number(exp.dueDay), U.daysInMonth(y, m)));
  }
  /** Número da parcela num mês (null se fora do parcelamento). */
  function installmentFor(exp, month) {
    if (exp.type !== 'parcela' || !exp.installmentCurrent) return null;
    const n = Number(exp.installmentCurrent) + monthsBetween(exp.startMonth, month);
    return n >= 1 && n <= Number(exp.installmentTotal) ? n : null;
  }
  function lastMonthOf(exp) {
    if (exp.type === 'parcela' && exp.installmentTotal) return U.addMonths(exp.startMonth, Number(exp.installmentTotal) - Number(exp.installmentCurrent));
    if (exp.status === 'encerrada' && exp.endedMonth) return exp.endedMonth;
    return null;
  }
  /** Andamento de um parcelamento. */
  function progress(exp) {
    const entries = S.state.expenseEntries.filter((e) => e.expenseId === exp.id && e.installmentNumber);
    const paidNums = entries.filter((e) => e.status === 'pago').map((e) => e.installmentNumber);
    const before = Math.max(0, Number(exp.installmentCurrent || 1) - 1); // parcelas pagas antes do sistema
    const paid = before + paidNums.length;
    const total = Number(exp.installmentTotal) || 0;
    const remaining = Math.max(0, total - paid);
    return { paid, total, remaining, remainingAmount: round2(remaining * (Number(exp.amount) || 0)), finished: total > 0 && paid >= total, nextNumber: paid < total ? paid + 1 : null };
  }

  function monthSummary(month, ref) {
    ref = ref || U.today();
    const list = entriesOf(month);
    const sum = (arr, f) => round2(arr.reduce((a, e) => a + (f ? f(e) : Number(e.amount) || 0), 0));
    const paid = list.filter((e) => e.status === 'pago');
    const late = list.filter((e) => isOverdue(e, ref));
    const open = list.filter((e) => e.status !== 'pago');
    const soonLimit = U.addDays(ref, Number(S.settings().soonDays) || 5);
    const toCome = open.filter((e) => !isOverdue(e, ref));
    // Pago no mês pela data do pagamento (caixa), usado no saldo.
    const paidCash = S.state.expenseEntries.filter((e) => e.status === 'pago' && (e.paidAt || '').slice(0, 7) === month);
    return {
      list, expected: sum(list), paid: sum(paid, paidValue), paidCount: paid.length,
      pending: sum(open.filter((e) => !isOverdue(e, ref))), pendingCount: toCome.length,
      late: sum(late), lateCount: late.length,
      soonCount: open.filter((e) => e.dueDate && e.dueDate >= ref && e.dueDate <= soonLimit).length,
      paidCash: sum(paidCash, paidValue),
      byCategory: groupBy(list, (e) => (e.type === 'variavel' ? 'Gastos variáveis' : e.category || 'Outros')),
      recurring: sum(list.filter((e) => e.type === 'fixa' || e.type === 'assinatura')),
      installments: sum(list.filter((e) => e.type === 'parcela')),
      variable: sum(list.filter((e) => ONE_OFF.has(e.type))),
    };
  }
  function groupBy(list, keyFn) {
    const m = new Map();
    list.forEach((e) => {
      const k = keyFn(e);
      const g = m.get(k) || { name: k, expected: 0, paid: 0, count: 0 };
      g.expected = round2(g.expected + (Number(e.amount) || 0));
      if (e.status === 'pago') g.paid = round2(g.paid + paidValue(e));
      g.count++;
      m.set(k, g);
    });
    return Array.from(m.values()).sort((a, b) => b.expected - a.expected);
  }

  /* ---------- Geração mensal (sem duplicar) ---------- */
  const creating = new Set();
  function ensureEntries() {
    const L = S.state.loaded;
    if (!L.expenses || !L.expenseEntries) return;
    const repo = S._repo();
    const cur = U.currentYm();
    // 12 meses à frente: parcelas e assinaturas já aparecem no previsto do próximo ano.
    const last = U.addMonths(cur, S.HORIZON_MONTHS || 12);
    const have = new Set(S.state.expenseEntries.map((e) => e.id));
    S.state.expenses.forEach((exp) => {
      if (!RECURRING.has(exp.type) || !exp.startMonth) return;
      let m = exp.startMonth < U.addMonths(cur, -24) ? U.addMonths(cur, -24) : exp.startMonth;
      const stop = lastMonthOf(exp);
      for (let i = 0; i < 40 && m <= last; i++, m = U.addMonths(m, 1)) {
        if (stop && m > stop) break;
        if (exp.status === 'encerrada' && !exp.endedMonth) break;
        const n = installmentFor(exp, m);
        if (exp.type === 'parcela' && !n) continue;
        const id = exp.id + '_' + m;
        if (have.has(id) || creating.has(id)) continue;
        creating.add(id);
        repo.set('expenseEntries', id, buildEntry(exp, m, n)).catch((e) => console.warn('expenseEntry', e)).finally(() => creating.delete(id));
      }
    });
  }
  function buildEntry(exp, month, n) {
    const now = new Date().toISOString();
    return {
      expenseId: exp.id, name: exp.name, category: exp.category, type: exp.type, month, amount: round2(exp.amount), payer: PARTNERS[exp.payer] ? exp.payer : '',
      dueDate: dueDateFor(exp, month), purchaseDate: '', paymentMethod: exp.paymentMethod || '',
      status: 'pendente', paidAt: null, paidAmount: null,
      installmentNumber: n || null, installmentTotal: n ? Number(exp.installmentTotal) : null, notes: '', createdAt: now, updatedAt: now,
    };
  }

  /* ---------- Escrita ---------- */
  async function saveExpense(data) {
    const repo = S._repo();
    const isNew = !data.id;
    const id = data.id || 'e_' + U.slug(data.name).slice(0, 24) + '-' + Date.now().toString(36);
    const prev = expenseById(id);
    const type = RECURRING.has(data.type) ? data.type : 'fixa';
    const doc = {
      name: data.name.trim(), category: (data.category || '').trim() || 'Outros', type, amount: round2(U.parseMoney(data.amount)),
      payer: PARTNERS[data.payer] ? data.payer : '',
      dueDay: data.dueDay ? Math.min(31, Math.max(1, Number(data.dueDay))) : null,
      paymentMethod: METHODS[data.paymentMethod] ? data.paymentMethod : '', recurrence: 'mensal',
      startMonth: data.startMonth || (prev && prev.startMonth) || U.currentYm(),
      status: data.status === 'encerrada' ? 'encerrada' : 'ativa', endedMonth: data.status === 'encerrada' ? (data.endedMonth || (prev && prev.endedMonth) || U.currentYm()) : null,
      installmentCurrent: type === 'parcela' ? Math.max(1, Number(data.installmentCurrent) || 1) : null,
      installmentTotal: type === 'parcela' ? Math.max(1, Number(data.installmentTotal) || 1) : null,
      notes: (data.notes || '').trim(), createdAt: (prev && prev.createdAt) || new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    if (type === 'parcela' && doc.installmentCurrent > doc.installmentTotal) doc.installmentTotal = doc.installmentCurrent;
    const ok = await S.guard(repo.set('expenses', id, doc), isNew ? 'Despesa cadastrada.' : 'Despesa atualizada.');
    if (!ok) return null;
    S.log('expense', (isNew ? 'Despesa cadastrada: ' : 'Despesa atualizada: ') + doc.name, { expenseId: id });
    // Lançamentos em aberto a partir deste mês acompanham a alteração (meses anteriores ficam como estão).
    const cur = U.currentYm();
    const exp = Object.assign({ id }, doc);
    const stop = lastMonthOf(exp);
    // Meses anteriores guardam quem pagava antes, para o fechamento deles não mudar.
    if (prev && prev.payer !== doc.payer) {
      for (const en of S.state.expenseEntries.filter((e) => e.expenseId === id && e.month < cur && !e.payer && prev.payer)) {
        await repo.update('expenseEntries', en.id, { payer: prev.payer }).catch((e) => console.warn(e));
      }
    }
    for (const en of S.state.expenseEntries.filter((e) => e.expenseId === id && e.month >= cur && e.status !== 'pago')) {
      const n = installmentFor(exp, en.month);
      if ((stop && en.month > stop) || (type === 'parcela' && !n)) { await repo.remove('expenseEntries', en.id).catch(() => {}); continue; }
      const patch = { name: doc.name, category: doc.category, type, amount: doc.amount, paymentMethod: doc.paymentMethod, payer: doc.payer, installmentNumber: n, installmentTotal: n ? doc.installmentTotal : null, updatedAt: new Date().toISOString() };
      const dd = dueDateFor(exp, en.month);
      if (dd && (!en.dueDate || (prev && prev.dueDay !== doc.dueDay))) patch.dueDate = dd;
      await repo.update('expenseEntries', en.id, patch).catch((e) => console.warn(e));
    }
    return id;
  }

  async function endExpense(id, month) {
    const exp = expenseById(id);
    if (!exp) return;
    return saveExpense(Object.assign({}, exp, { status: 'encerrada', endedMonth: month || U.currentYm() }));
  }

  async function deleteExpense(id, keepHistory) {
    const exp = expenseById(id);
    if (!exp) return;
    const repo = S._repo();
    const ok = await S.guard(repo.remove('expenses', id), 'Despesa excluída.');
    if (!ok) return;
    for (const en of S.state.expenseEntries.filter((e) => e.expenseId === id)) {
      if (!keepHistory || en.status !== 'pago') await repo.remove('expenseEntries', en.id).catch(() => {});
    }
    S.log('expense', 'Despesa excluída: ' + exp.name, { expenseId: id });
  }

  /** Lançamento avulso (gasto variável ou compra eventual) ou edição de qualquer lançamento. */
  async function saveEntry(data) {
    const repo = S._repo();
    const isNew = !data.id;
    const prev = data.id ? entryById(data.id) : null;
    const id = data.id || 'v_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const paid = data.status === 'pago' || (!!data.paidAt && data.status !== 'pendente' && data.status !== 'agendado');
    // O mês do gasto avulso é o da data do pagamento (ou do vencimento/compra, se ainda não foi pago).
    const refDate = (paid && data.paidAt) || data.dueDate || data.purchaseDate || data.paidAt || U.today();
    const doc = Object.assign({}, prev || {}, {
      expenseId: prev ? prev.expenseId || null : null,
      name: data.name.trim(), category: (data.category || '').trim() || 'Outras compras',
      type: prev && prev.expenseId ? prev.type : (ONE_OFF.has(data.type) ? data.type : 'variavel'),
      payer: PARTNERS[data.payer] ? data.payer : (prev ? prev.payer || '' : ''),
      month: prev && prev.expenseId ? prev.month : refDate.slice(0, 7),
      amount: round2(U.parseMoney(data.amount)), dueDate: data.dueDate || '', purchaseDate: data.purchaseDate || '',
      paymentMethod: METHODS[data.paymentMethod] ? data.paymentMethod : '',
      status: paid ? 'pago' : (STATUS[data.status] ? data.status : 'pendente'),
      paidAt: paid ? (data.paidAt || U.today()) : null,
      paidAmount: paid ? (data.paidAmount != null && data.paidAmount !== '' ? round2(U.parseMoney(data.paidAmount)) : round2(U.parseMoney(data.amount))) : null,
      notes: (data.notes || '').trim(), createdAt: (prev && prev.createdAt) || new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    delete doc.id;
    const ok = await S.guard(repo.set('expenseEntries', id, doc), isNew ? 'Gasto lançado.' : 'Lançamento atualizado.');
    if (!ok) return null;
    if (isNew) S.log('expense', 'Gasto lançado: ' + doc.name + ' (' + doc.category + ') · pago por ' + partnerName(doc.payer), { entryId: id, amount: doc.amount });
    else if (prev && payerOf(prev) !== doc.payer && doc.payer) S.log('expense', 'Quem pagou ' + doc.name + ' (' + U.monthLabel(doc.month, { noYear: true }) + '): ' + partnerName(doc.payer), { entryId: id });
    return id;
  }

  async function deleteEntry(id) {
    const en = entryById(id);
    if (!en) return;
    const ok = await S.guard(S._repo().remove('expenseEntries', id), 'Lançamento excluído.');
    if (ok) S.log('expense', 'Lançamento excluído: ' + en.name, { entryId: id });
  }

  async function setEntryStatus(id, status, opts) {
    const en = entryById(id);
    if (!en) return false;
    opts = opts || {};
    const patch = { status, updatedAt: new Date().toISOString() };
    if (status === 'pago') { patch.paidAt = opts.paidAt || U.today(); patch.paidAmount = opts.paidAmount != null && opts.paidAmount !== '' ? round2(U.parseMoney(opts.paidAmount)) : en.amount; }
    else { patch.paidAt = null; patch.paidAmount = null; }
    if (opts.dueDate) patch.dueDate = opts.dueDate;
    const ok = await S.guard(S._repo().update('expenseEntries', id, patch));
    if (!ok) return false;
    const label = en.name + (en.installmentNumber ? ' (' + en.installmentNumber + '/' + en.installmentTotal + ')' : '') + ' · ' + U.monthLabel(en.month, { noYear: true });
    if (status === 'pago') {
      const isLast = en.installmentNumber && en.installmentNumber === en.installmentTotal;
      V.ui.toast(isLast ? 'Última parcela paga. Parcelamento quitado.' : 'Pagamento registrado.');
      S.log('expense_paid', 'Despesa paga: ' + label + (isLast ? ' · parcelamento quitado' : ''), { entryId: id, expenseId: en.expenseId, amount: patch.paidAmount });
    } else {
      V.ui.toast('Status atualizado: ' + STATUS[status] + '.');
    }
    return true;
  }

  async function setEntryPayer(id, payer) {
    const en = entryById(id);
    if (!en || !PARTNERS[payer]) return false;
    const ok = await S.guard(S._repo().update('expenseEntries', id, { payer, updatedAt: new Date().toISOString() }), en.name + ': pago por ' + PARTNERS[payer] + '.');
    if (ok) S.log('expense', 'Quem pagou ' + en.name + ' (' + U.monthLabel(en.month, { noYear: true }) + '): ' + PARTNERS[payer], { entryId: id });
    return ok;
  }

  /** Registra (ou atualiza) o acerto do mês. Não é despesa: fica numa coleção própria. */
  async function saveSettlement(month, data) {
    const calc = settlementCalc(month);
    const prev = settlementById(month);
    const status = data.status === 'concluido' ? 'concluido' : 'pendente';
    const from = PARTNERS[data.from] ? data.from : calc.debtor || 'natasha';
    const doc = {
      month, status, date: data.date || '', amount: round2(U.parseMoney(data.amount)), from, to: PARTNERS[data.to] ? data.to : other(from),
      notes: (data.notes || '').trim(),
      snapshot: { karol: calc.karol, natasha: calc.natasha, total: calc.total, share: calc.share, net: calc.net },
      createdAt: (prev && prev.createdAt) || new Date().toISOString(), updatedAt: new Date().toISOString(),
      completedAt: status === 'concluido' ? ((prev && prev.status === 'concluido' && prev.completedAt) || new Date().toISOString()) : null,
    };
    const ok = await S.guard(S._repo().set('settlements', month, doc), status === 'concluido' ? 'Acerto registrado como concluído.' : 'Acerto registrado como pendente.');
    if (ok) S.log('settlement', 'Acerto de ' + U.monthLabel(month, { noYear: true }) + ': ' + PARTNERS[doc.from] + ' → ' + PARTNERS[doc.to] + ' (' + SETTLE_STATUS[status].toLowerCase() + ')', { month, amount: doc.amount });
    return ok;
  }
  async function deleteSettlement(month) {
    const ok = await S.guard(S._repo().remove('settlements', month), 'Registro de acerto removido.');
    if (ok) S.log('settlement', 'Registro do acerto de ' + U.monthLabel(month, { noYear: true }) + ' removido', { month });
    return ok;
  }

  V.expenses = {
    PARTNERS, SETTLE_STATUS, SETTLE_DAY, ONE_OFF, payerOf, partnerName, settlementCalc, settlementHistory, settlementById, setEntryPayer, saveSettlement, deleteSettlement,
    TYPES, RECURRING, METHODS, STATUS, CATEGORIES, VARIABLE_CATEGORIES, SEED_EXPENSES, round2, monthsBetween,
    expenseById, entryById, entriesOf, isOverdue, effStatus, paidValue, dueDateFor, installmentFor, progress, monthSummary, groupBy,
    ensureEntries, saveExpense, endExpense, deleteExpense, saveEntry, deleteEntry, setEntryStatus,
  };
})(window.Vulpes = window.Vulpes || {});
