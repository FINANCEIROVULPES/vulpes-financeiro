/* DESPESAS: contas a pagar, assinaturas, parcelamentos e gastos variáveis, com calendário e relatório. */
(function (V) {
  'use strict';
  const U = V.util, S = V.store, I = V.ui, E = V.expenses, C = V.cal;

  const TABS = [['contas', 'Contas do mês'], ['acerto', 'Acerto entre sócias'], ['variaveis', 'Gastos variáveis'], ['cadastro', 'Recorrentes e parcelas'], ['calendario', 'Calendário'], ['relatorio', 'Relatório']];

  const statusPill = (st) => '<span class="pill x-' + st + '">' + U.esc(E.STATUS[st]) + '</span>';
  const typeTag = (t) => '<span class="type-tag t-' + t + '">' + U.esc(E.TYPES[t] || t) + '</span>';
  const methodLabel = (m) => U.esc(E.METHODS[m || ''] || 'Não informado');
  function statusSelect(en) {
    const eff = E.effStatus(en);
    return '<select class="status-select x-' + eff + '" data-act="exp-status" data-id="' + U.esc(en.id) + '" aria-label="Status de ' + U.esc(en.name) + '">' +
      Object.keys(E.STATUS).map((k) => '<option value="' + k + '"' + (k === eff ? ' selected' : '') + '>' + E.STATUS[k] + '</option>').join('') + '</select>';
  }
  function instLabel(en) {
    if (!en.installmentNumber) return '';
    const last = en.installmentNumber === en.installmentTotal;
    return ' <span class="inst-chip' + (last ? ' last' : '') + '">' + en.installmentNumber + '/' + en.installmentTotal + (last ? ' · última' : '') + '</span>';
  }
  const payerChip = (p) => (p ? '<span class="payer-chip p-' + p + '">' + U.esc(E.PARTNERS[p]) + '</span>' : '<span class="payer-chip p-none">Não definido</span>');
  function payerSelect(en) {
    const p = E.payerOf(en);
    return '<select class="payer-select p-' + (p || 'none') + '" data-act="exp-payer" data-id="' + U.esc(en.id) + '" aria-label="Quem pagou ' + U.esc(en.name) + '">' +
      (p ? '' : '<option value="" selected>Definir…</option>') + Object.keys(E.PARTNERS).map((k) => '<option value="' + k + '"' + (k === p ? ' selected' : '') + '>' + E.PARTNERS[k] + '</option>').join('') + '</select>';
  }
  /** Pergunta obrigatória "Quem pagou?" (botões Karol / Natasha). */
  const payerField = (label, cur) => '<fieldset class="field full payer-field"><legend>' + label + ' <span class="req">obrigatório</span></legend><div class="payer-opts">' +
    Object.keys(E.PARTNERS).map((k) => '<label class="payer-opt p-' + k + '"><input type="radio" name="payer" value="' + k + '"' + (k === cur ? ' checked' : '') + '><span>' + E.PARTNERS[k] + '</span></label>').join('') + '</div></fieldset>';
  const opt = (v, l, cur) => '<option value="' + U.esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + U.esc(l) + '</option>';

  /* ---------- Blocos ---------- */
  function kpis(sm) {
    const k = (cls, label, value, sub) => '<div class="card kpi ' + cls + '"><div class="k-label">' + label + '</div><div class="k-value">' + value + '</div><div class="k-sub">' + sub + '</div></div>';
    return '<div class="kpis kpis-5">' +
      k('dark', 'Previstas no mês', U.money(sm.expected), sm.list.length + ' lançamentos') +
      k('ok', 'Já pagas', U.money(sm.paid), sm.paidCount + ' contas pagas') +
      k('warn', 'Pendentes', U.money(sm.pending), sm.pendingCount + ' contas a vencer') +
      k(sm.lateCount ? 'bad' : '', 'Atrasadas', U.money(sm.late), sm.lateCount + (sm.lateCount === 1 ? ' conta vencida' : ' contas vencidas')) +
      k('', 'Contas a vencer', String(sm.pendingCount), sm.soonCount + ' nos próximos ' + (Number(S.settings().soonDays) || 5) + ' dias') +
      '</div>';
  }

  function categoryChart(sm) {
    const groups = sm.byCategory;
    if (!groups.length) return I.empty('Sem despesas neste mês.', 'wallet');
    const max = groups[0].expected || 1;
    const total = sm.expected || 1;
    return '<div class="cat-chart">' + groups.map((g) => {
      const w = Math.max(2, (g.expected / max) * 100);
      const pw = g.expected ? (g.paid / g.expected) * 100 : 0;
      return '<div class="cat-row"><div class="cat-name">' + U.esc(g.name) + '<span>' + g.count + (g.count === 1 ? ' item' : ' itens') + '</span></div>' +
        '<div class="cat-bar" title="' + U.esc(U.money(g.paid) + ' pagos de ' + U.money(g.expected)) + '"><i style="width:' + w + '%"><b style="width:' + pw + '%"></b></i></div>' +
        '<div class="cat-val"><b>' + U.money(g.expected) + '</b><span>' + Math.round((g.expected / total) * 100) + '%</span></div></div>';
    }).join('') + '<div class="legend" style="margin-top:6px"><span><i style="background:var(--vl)"></i>Previsto</span><span><i style="background:var(--ink)"></i>Já pago</span></div></div>';
  }

  function entryRows(list) {
    if (!list.length) return '<tr><td colspan="9">' + I.empty('Nenhuma despesa encontrada.', 'wallet') + '</td></tr>';
    const t = U.today();
    return list.map((en) => '<tr>' +
      '<td><div class="cell-name">' + U.esc(en.name) + instLabel(en) + '</div><div class="cell-sub">' + typeTag(en.type) + '</div></td>' +
      '<td class="cell-sub">' + U.esc(en.category || '') + '</td>' +
      '<td>' + (en.dueDate ? '<div class="tnum"' + (E.isOverdue(en, t) ? ' style="color:var(--bad);font-weight:600"' : '') + '>' + U.dateBR(en.dueDate) + '</div><div class="cell-sub">' + (en.status !== 'pago' ? U.relDays(en.dueDate) : U.esc(U.weekday(en.dueDate))) + '</div>'
        : '<button class="btn sm ghost" data-act="exp-edit-entry" data-id="' + U.esc(en.id) + '">Definir data</button>') + '</td>' +
      '<td class="r"><b>' + U.money(en.amount) + '</b></td>' +
      '<td>' + payerSelect(en) + '</td>' +
      '<td class="cell-sub">' + methodLabel(en.paymentMethod) + '</td>' +
      '<td>' + statusSelect(en) + '</td>' +
      '<td>' + (en.status === 'pago' ? '<div class="tnum">' + U.dateBR(en.paidAt) + '</div>' + (en.paidAmount != null && en.paidAmount !== en.amount ? '<div class="cell-sub">' + U.money(en.paidAmount) + '</div>' : '') : '<span class="muted">—</span>') + '</td>' +
      '<td><div class="actions">' + (en.status !== 'pago' ? '<button class="btn sm" data-act="exp-pay" data-id="' + U.esc(en.id) + '">' + I.icon('check') + 'Pagar</button>' : '') +
      '<button class="btn sm" data-act="exp-edit-entry" data-id="' + U.esc(en.id) + '" title="Detalhes e edição">' + I.icon('edit') + '</button>' +
      (!en.expenseId ? '<button class="btn sm danger" data-act="exp-del-entry" data-id="' + U.esc(en.id) + '" title="Excluir">' + I.icon('trash') + '</button>' : '') +
      '</div></td></tr>').join('');
  }

  function filteredEntries(ui) {
    const f = ui.desp, q = U.norm(f.q), t = U.today();
    return E.entriesOf(ui.month).filter((en) =>
      (!q || U.norm(en.name).includes(q) || U.norm(en.category).includes(q)) &&
      (!f.type || en.type === f.type) && (!f.payer || (f.payer === 'none' ? !E.payerOf(en) : E.payerOf(en) === f.payer)) && (!f.status || E.effStatus(en, t) === f.status) && (!f.category || en.category === f.category))
      .sort((a, b) => ((a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : (a.dueDate || '9999') > (b.dueDate || '9999') ? 1 : U.norm(a.name).localeCompare(U.norm(b.name))));
  }

  function tabContas(ui) {
    const f = ui.desp;
    const cats = Array.from(new Set(E.entriesOf(ui.month).map((e) => e.category).filter(Boolean))).sort();
    return '<div class="card"><div class="toolbar">' +
      '<div class="search">' + I.icon('search') + '<input class="input" id="dp-q" type="search" placeholder="Buscar despesa" value="' + U.esc(f.q) + '" data-filter="desp.q"></div>' +
      '<select class="input" id="dp-type" data-filter="desp.type" aria-label="Tipo">' + opt('', 'Todos os tipos', f.type) + Object.keys(E.TYPES).map((k) => opt(k, E.TYPES[k], f.type)).join('') + '</select>' +
      '<select class="input" id="dp-cat" data-filter="desp.category" aria-label="Categoria">' + opt('', 'Todas as categorias', f.category) + cats.map((c) => opt(c, c, f.category)).join('') + '</select>' +
      '<select class="input" id="dp-payer" data-filter="desp.payer" aria-label="Quem pagou">' + opt('', 'Karol e Natasha', f.payer) + opt('karol', 'Pago por Karol', f.payer) + opt('natasha', 'Pago por Natasha', f.payer) + opt('none', 'Sem responsável', f.payer) + '</select>' +
      '<select class="input" id="dp-status" data-filter="desp.status" aria-label="Status">' + opt('', 'Todos os status', f.status) + Object.keys(E.STATUS).map((k) => opt(k, E.STATUS[k], f.status)).join('') + '</select>' +
      '</div><div class="table-wrap"><table><thead><tr><th>Despesa</th><th>Categoria</th><th>Vencimento</th><th class="r">Valor</th><th>Quem pagou</th><th>Forma</th><th>Status</th><th>Pago em</th><th class="r">Ações</th></tr></thead>' +
      '<tbody data-results>' + entryRows(filteredEntries(ui)) + '</tbody></table></div></div>';
  }

  function tabVariaveis(ui) {
    const list = E.entriesOf(ui.month).filter((e) => E.ONE_OFF.has(e.type))
      .sort((a, b) => ((a.purchaseDate || a.dueDate || a.paidAt || '') < (b.purchaseDate || b.dueDate || b.paidAt || '') ? 1 : -1));
    const groups = E.groupBy(list, (e) => e.category || 'Outras compras');
    const total = list.reduce((a, e) => a + e.amount, 0);
    const rows = list.length ? list.map((en) => '<tr>' +
      '<td><div class="cell-name">' + U.esc(en.name) + '</div><div class="cell-sub">' + typeTag(en.type) + (en.notes ? ' ' + U.esc(en.notes) : '') + '</div></td>' +
      '<td class="cell-sub">' + U.esc(en.category) + '</td>' +
      '<td class="tnum">' + U.dateBR(en.purchaseDate) + '</td>' +
      '<td class="tnum">' + (en.status === 'pago' ? U.dateBR(en.paidAt) : (en.dueDate ? 'vence ' + U.dateBR(en.dueDate) : '<span class="muted">—</span>')) + '</td>' +
      '<td class="r"><b>' + U.money(en.amount) + '</b></td><td>' + payerSelect(en) + '</td><td>' + statusSelect(en) + '</td>' +
      '<td><div class="actions"><button class="btn sm" data-act="exp-edit-entry" data-id="' + U.esc(en.id) + '">' + I.icon('edit') + '</button><button class="btn sm danger" data-act="exp-del-entry" data-id="' + U.esc(en.id) + '">' + I.icon('trash') + '</button></div></td></tr>').join('')
      : '<tr><td colspan="8">' + I.empty('Nenhum gasto variável lançado neste mês.', 'wallet') + '</td></tr>';
    return '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><div><h2>Gastos variáveis de ' + U.esc(U.monthLabel(ui.month, { noYear: true })) + '</h2><p>Mercado, escritório, materiais de gravação, equipamentos, acessórios, manutenção e outros. Sem limite; cada gasto entra no acerto do mês da data de pagamento.</p></div>' +
      '<button class="btn primary" data-act="exp-new-var">' + I.icon('plus') + 'Adicionar gasto</button></div>' +
      '<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Gasto</th><th>Categoria</th><th>Compra</th><th>Pagamento</th><th class="r">Valor</th><th>Quem pagou</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Por categoria</h2><p>Total do mês: <b>' + U.money(total) + '</b></p></div></div><div class="card-pad">' +
      (groups.length ? categoryChart({ byCategory: groups, expected: total }) : '<div class="muted small">Os totais por categoria aparecem aqui.</div>') + '</div></div></div>';
  }

  function tabCadastro() {
    const sec = (types, title, hint) => {
      const list = S.state.expenses.filter((e) => types.includes(e.type));
      const rows = list.length ? list.map((e) => {
        const pr = e.type === 'parcela' ? E.progress(e) : null;
        const ended = e.status === 'encerrada' || (pr && pr.finished);
        return '<tr' + (ended ? ' class="row-ended"' : '') + '><td><div class="cell-name">' + U.esc(e.name) + '</div><div class="cell-sub">' + U.esc(e.category) + (e.notes ? ' · ' + U.esc(e.notes) : '') + '</div></td>' +
          '<td class="r"><b>' + U.money(e.amount) + '</b>' + (pr ? '<div class="cell-sub">por parcela</div>' : '<div class="cell-sub">por mês</div>') + '</td>' +
          '<td>' + (e.dueDay ? 'Dia ' + e.dueDay : '<span class="muted">Sem data</span>') + '</td>' +
          '<td>' + payerChip(E.PARTNERS[e.payer] ? e.payer : '') + '</td>' +
          '<td>' + (pr ? '<div class="tnum"><b>' + pr.paid + '</b> de ' + pr.total + ' pagas</div><div class="bar" style="min-width:110px"><i style="width:' + (pr.total ? (pr.paid / pr.total) * 100 : 0) + '%"></i></div><div class="cell-sub">' + (pr.finished ? 'Quitado' : 'Restam ' + pr.remaining + ' · ' + U.money(pr.remainingAmount)) + '</div>'
            : (e.status === 'encerrada' ? '<span class="cell-sub">Encerrada em ' + U.esc(U.monthLabel(e.endedMonth)) + '</span>' : '<span class="cell-sub">Desde ' + U.esc(U.monthLabel(e.startMonth)) + '</span>')) + '</td>' +
          '<td>' + (pr && pr.finished ? '<span class="pill x-pago">Finalizado</span>' : e.status === 'encerrada' ? '<span class="pill">Encerrada</span>' : '<span class="pill s-ativo">Ativa</span>') + '</td>' +
          '<td><div class="actions"><button class="btn sm" data-act="exp-edit" data-id="' + U.esc(e.id) + '" title="Editar">' + I.icon('edit') + '</button>' +
          (e.status !== 'encerrada' && !(pr && pr.finished) ? '<button class="btn sm" data-act="exp-end" data-id="' + U.esc(e.id) + '">' + (e.type === 'assinatura' ? 'Cancelar' : 'Encerrar') + '</button>' : '') +
          '<button class="btn sm danger" data-act="exp-del" data-id="' + U.esc(e.id) + '" title="Excluir">' + I.icon('trash') + '</button></div></td></tr>';
      }).join('') : '<tr><td colspan="7"><div class="muted small" style="padding:8px 0">Nada cadastrado.</div></td></tr>';
      return '<div class="card"><div class="card-head"><div><h2>' + title + '</h2><p>' + hint + '</p></div></div><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Despesa</th><th class="r">Valor</th><th>Vencimento</th><th>Quem paga</th><th>Andamento</th><th>Situação</th><th class="r">Ações</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
    };
    return sec(['fixa'], 'Fixas recorrentes', 'Lançadas automaticamente todo mês.') +
      sec(['assinatura'], 'Assinaturas e ferramentas', 'Cancele uma assinatura para parar os lançamentos dos meses seguintes.') +
      sec(['parcela'], 'Equipamentos e compras parceladas', 'O número da parcela avança a cada mês e os lançamentos param na última parcela.');
  }

  function tabCalendario(ui) {
    const month = ui.month;
    const { y, m } = U.ymParts(month);
    const s = S.settings();
    const t = U.today();
    const soon = U.addDays(t, Number(s.soonDays) || 5);
    const list = E.entriesOf(month);
    const byDay = new Map();
    list.filter((e) => e.dueDate).forEach((e) => { if (!byDay.has(e.dueDate)) byDay.set(e.dueDate, []); byDay.get(e.dueDate).push(e); });
    const ev = (e) => {
      const st = E.effStatus(e, t);
      const isSoon = e.status !== 'pago' && e.dueDate >= t && e.dueDate <= soon;
      return '<button class="ev x-' + st + (isSoon ? ' soon' : '') + '" data-act="exp-edit-entry" data-id="' + U.esc(e.id) + '" title="' + U.esc(e.name + ' · ' + U.money(e.amount) + ' · ' + E.STATUS[st]) + '"><b>' + U.esc(e.name) + (e.installmentNumber ? ' ' + e.installmentNumber + '/' + e.installmentTotal : '') + '</b><span>' + U.money(e.amount) + ' · ' + U.esc(E.STATUS[st]) + '</span></button>';
    };
    const first = new Date(y, m - 1, 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    const last = new Date(y, m, 0);
    const end = new Date(last); end.setDate(last.getDate() + (6 - last.getDay()));
    let cells = U.WEEKDAYS_SHORT.map((d) => '<div class="cal-dow">' + d + '</div>').join('');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = U.ymd(d), out = d.getMonth() !== m - 1, hol = C.holidayName(k, s.bankDays), dow = d.getDay();
      const items = out ? [] : (byDay.get(k) || []);
      cells += '<div class="cal-day' + (out ? ' out' : '') + (k === t ? ' today' : '') + (hol && !out ? ' holiday' : '') + ((dow === 0 || dow === 6) && !out ? ' weekend' : '') + '">' +
        '<div class="d-top"><span class="d-num">' + d.getDate() + '</span>' + (items.length > 1 ? '<span class="d-total">' + U.moneyShort(items.reduce((a, e) => a + e.amount, 0)) + '</span>' : '') + '</div>' +
        (hol && !out ? '<div class="d-hol">' + U.esc(hol) + '</div>' : '') + items.map(ev).join('') + '</div>';
    }
    const days = Array.from(byDay.keys()).sort();
    const agenda = days.length ? days.map((k) => '<div class="list-item" style="align-items:flex-start">' + I.dateBox(k) + '<div class="grow" style="display:grid;gap:6px">' + byDay.get(k).map(ev).join('') + '</div></div>').join('') : I.empty('Nenhuma conta com data neste mês.', 'calendar');
    const undated = list.filter((e) => !e.dueDate && e.status !== 'pago');
    return '<div class="row small muted" style="gap:14px">' + ['pendente', 'pago', 'atraso', 'agendado'].map(statusPill).join('') + '<span>Contorno âmbar: vence em até ' + (Number(s.soonDays) || 5) + ' dias</span></div>' +
      '<div class="card cal-grid-card" style="overflow:hidden"><div class="cal">' + cells + '</div><div class="list cal-agenda">' + agenda + '</div></div>' +
      (undated.length ? '<div class="card"><div class="card-head"><div><h2>Sem data de vencimento</h2><p>Clique para informar a data. Ela passa a valer para os próximos meses se você editar a despesa no cadastro.</p></div></div><div class="card-pad undated">' + undated.map(ev).join('') + '</div></div>' : '');
  }

  function tabRelatorio(ui) {
    const month = ui.month, prevM = U.addMonths(month, -1);
    const sm = E.monthSummary(month), sp = E.monthSummary(prevM);
    const spent = sm.paid, prevSpent = sp.paid;
    const diff = E.round2(spent - prevSpent);
    const pct = prevSpent ? Math.round((diff / prevSpent) * 100) : null;
    const active = S.state.expenses.filter((e) => e.status !== 'encerrada' && !(e.type === 'parcela' && E.progress(e).finished));
    const structure = E.round2(active.filter((e) => e.type === 'fixa' || e.type === 'assinatura').reduce((a, e) => a + e.amount, 0));
    const instRunning = S.state.expenses.filter((e) => e.type === 'parcela' && !E.progress(e).finished);
    const instDone = S.state.expenses.filter((e) => e.type === 'parcela' && E.progress(e).finished);
    const stat = (label, value, sub, color) => '<div class="mini-stat"><span>' + label + '</span><b' + (color ? ' style="color:' + color + '"' : '') + '>' + value + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>';
    const months = []; for (let i = 11; i >= 0; i--) months.push(U.addMonths(U.currentYm(), -i));
    const hist = months.map((m) => ({ m, s: E.monthSummary(m) })).filter((x) => x.s.list.length);
    const maxH = Math.max(1, ...hist.map((x) => x.s.expected));
    const catRows = sm.byCategory.map((g) => '<tr><td>' + U.esc(g.name) + '</td><td class="r">' + U.money(g.expected) + '</td><td class="r" style="color:var(--ok)">' + U.money(g.paid) + '</td><td class="r">' + (sm.expected ? Math.round((g.expected / sm.expected) * 100) : 0) + '%</td></tr>').join('');
    const instRow = (e) => { const p = E.progress(e); return '<div class="list-item" style="padding:10px 0"><div class="grow"><div class="cell-name">' + U.esc(e.name) + '</div><div class="cell-sub">' + U.money(e.amount) + ' por parcela · ' + p.paid + '/' + p.total + ' pagas' + (p.finished ? '' : ' · restam ' + U.money(p.remainingAmount)) + '</div></div><div class="bar" style="width:90px"><i style="width:' + (p.total ? (p.paid / p.total) * 100 : 0) + '%"></i></div></div>'; };
    return '<div class="mini-stats">' +
      stat('Total gasto no mês', U.money(spent), 'pago de ' + U.money(sm.expected) + ' previsto') +
      stat('Mês anterior', U.money(prevSpent), U.esc(U.monthLabel(prevM, { noYear: true }))) +
      stat('Variação', (diff > 0 ? '+' : '') + U.money(diff), pct == null ? 'sem base de comparação' : (pct > 0 ? '+' : '') + pct + '%', diff > 0 ? 'var(--bad)' : 'var(--ok)') +
      stat('Recorrentes', U.money(sm.recurring), 'fixas e assinaturas') +
      stat('Variáveis', U.money(sm.variable), 'gastos variáveis e eventuais') + '</div>' +
      '<div class="total-band card"><div><div class="eyebrow light">Custo para manter a estrutura da Vulpes</div><div class="tb-value">' + U.money(structure) + '<span> por mês</span></div></div>' +
      '<div class="tb-split"><div><span>Fixas</span><b>' + U.money(active.filter((e) => e.type === 'fixa').reduce((a, e) => a + e.amount, 0)) + '</b></div><div><span>Assinaturas</span><b>' + U.money(active.filter((e) => e.type === 'assinatura').reduce((a, e) => a + e.amount, 0)) + '</b></div><div><span>Parcelas ativas</span><b>' + U.money(instRunning.reduce((a, e) => a + e.amount, 0)) + '</b></div></div></div>' +
      '<div class="grid-2b">' +
      '<div class="card"><div class="card-head"><div><h2>Gastos por categoria</h2><p>' + U.esc(U.monthLabel(month)) + '</p></div></div><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Categoria</th><th class="r">Previsto</th><th class="r">Pago</th><th class="r">Peso</th></tr></thead><tbody>' + (catRows || '<tr><td colspan="4" class="muted">Sem dados.</td></tr>') + '</tbody></table></div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Parcelamentos</h2><p>' + instRunning.length + ' em andamento · ' + instDone.length + ' finalizados</p></div></div><div class="card-pad">' +
      '<div class="lbl-sm">Em andamento</div>' + (instRunning.map(instRow).join('') || '<div class="muted small">Nenhum.</div>') +
      '<div class="lbl-sm" style="margin-top:12px">Finalizados</div>' + (instDone.map(instRow).join('') || '<div class="muted small">Nenhum ainda.</div>') + '</div></div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Histórico mensal</h2><p>Previsto e pago em cada mês. Clique para abrir o mês.</p></div></div><div class="card-pad"><div class="hist">' +
      (hist.length ? hist.map((x) => '<button class="hist-col' + (x.m === month ? ' on' : '') + '" data-act="exp-month" data-month="' + x.m + '" title="' + U.esc(U.monthLabel(x.m) + ': ' + U.money(x.s.expected) + ' previsto, ' + U.money(x.s.paid) + ' pago') + '">' +
        '<span class="hist-bars"><i style="height:' + (x.s.expected / maxH) * 100 + '%"></i><b style="height:' + (x.s.paid / maxH) * 100 + '%"></b></span><span class="hist-lbl">' + U.MONTHS_SHORT[U.ymParts(x.m).m - 1] + '</span><span class="hist-val">' + U.moneyShort(x.s.expected) + '</span></button>').join('') : '<div class="muted small">O histórico aparece conforme os meses passam.</div>') +
      '</div><div class="legend"><span><i style="background:var(--line-strong)"></i>Previsto</span><span><i style="background:var(--vl)"></i>Pago</span></div></div></div>';
  }

  /* ---------- Acerto entre sócias ---------- */
  function settleState(c) {
    const t = U.today();
    if (c.done) return ['x-pago', 'Acerto concluído'];
    if (c.record) return ['x-agendado', 'Acerto registrado · pendente'];
    if (!c.debtor && c.total) return ['x-pago', 'Nada a transferir'];
    if (!c.total) return ['', 'Sem despesas'];
    return t >= c.date ? ['x-atraso', 'Aguardando acerto'] : ['x-pendente', 'Fecha em ' + U.dateBR(c.date)];
  }
  function resultText(c) {
    if (!c.total) return 'Nenhuma despesa com responsável neste mês.';
    if (!c.debtor) return 'Tudo certo: as duas pagaram o mesmo valor.';
    return '<b>' + E.PARTNERS[c.debtor] + '</b> deve <b>' + U.money(c.amount) + '</b> para <b>' + E.PARTNERS[c.creditor] + '</b>.';
  }
  function settlePanel(month, compact) {
    const c = E.settlementCalc(month);
    const [stCls, stLabel] = settleState(c);
    const r = c.record;
    const row = (label, value, sub, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><th scope="row">' + label + (sub ? '<span>' + sub + '</span>' : '') + '</th><td>' + value + '</td></tr>';
    const nm = U.MONTHS[U.ymParts(month).m - 1];
    const doneLine = c.done ? '<div class="settle-done">' + I.icon('check') + '<span>' + U.esc(E.PARTNERS[r.from]) + ' transferiu <b>' + U.money(r.amount) + '</b> para ' + U.esc(E.PARTNERS[r.to]) + (r.date ? ' em ' + U.dateBR(r.date) : '') + '.</span></div>' : '';
    const warns = [];
    if (c.changedAfter) warns.push('Os lançamentos deste mês mudaram depois do acerto. ' + (Math.abs(c.pending) > 0.004 ? 'Ainda falta acertar <b>' + U.money(Math.abs(c.pending)) + '</b> (' + E.PARTNERS[c.pending > 0 ? 'natasha' : 'karol'] + ' para ' + E.PARTNERS[c.pending > 0 ? 'karol' : 'natasha'] + ').' : 'O valor transferido continua correto.'));
    if (c.unassigned.length) warns.push('<b>' + c.unassigned.length + (c.unassigned.length === 1 ? ' despesa' : ' despesas') + ' sem responsável</b> (' + c.unassigned.map((e) => U.esc(e.name)).join(', ') + ' · ' + U.money(c.unassignedTotal) + ') ainda não ' + (c.unassigned.length === 1 ? 'entra' : 'entram') + ' no acerto. Defina quem pagou na lista de contas.');
    if (c.openCount) warns.push(c.openCount + (c.openCount === 1 ? ' conta ainda não foi marcada' : ' contas ainda não foram marcadas') + ' como paga; ' + (c.openCount === 1 ? 'ela entra' : 'elas entram') + ' no cálculo pelo valor previsto, na conta de quem paga.');
    return '<section class="settle card" aria-labelledby="settle-' + month + '">' +
      '<div class="settle-head"><div><div class="eyebrow light">Acerto entre sócias · todo dia ' + E.SETTLE_DAY + '</div><h2 id="settle-' + month + '">Fechamento de ' + U.esc(nm) + '</h2>' +
      '<p>Acerto em ' + U.dateBR(c.date) + ' · total do mês dividido igualmente entre Karol e Natasha</p></div><span class="pill ' + stCls + '">' + stLabel + '</span></div>' +
      '<div class="settle-grid"><table class="settle-table"><tbody>' +
      row('Total pago por Karol', U.money(c.karol), c.countK + (c.countK === 1 ? ' conta' : ' contas'), 'k') +
      row('Total pago por Natasha', U.money(c.natasha), c.countN + (c.countN === 1 ? ' conta' : ' contas'), 'n') +
      row('Total de despesas', U.money(c.total), '', 'tot') +
      row('Parte de cada uma', U.money(c.share), 'total ÷ 2', 'share') +
      '</tbody></table>' +
      '<div class="settle-result"><span class="lbl">' + (c.done ? 'Situação do acerto' : 'Resultado do acerto') + '</span><p>' + (c.done ? (Math.abs(c.pending) > 0.004 ? 'Ainda falta: <b>' + E.PARTNERS[c.pending > 0 ? 'natasha' : 'karol'] + '</b> deve <b>' + U.money(Math.abs(c.pending)) + '</b> para <b>' + E.PARTNERS[c.pending > 0 ? 'karol' : 'natasha'] + '</b>.' : 'Acerto feito. Nada pendente neste mês.') : resultText(c)) + '</p>' + doneLine +
      '<div class="row"><button class="btn primary cta" data-act="settle-open" data-month="' + month + '">' + I.icon('cash') + (r ? 'Editar acerto' : 'Registrar acerto') + '</button>' +
      (compact ? '<button class="btn ghost light" data-act="exp-tab" data-val="acerto">Histórico</button>' : '') + '</div></div></div>' +
      (warns.length ? '<div class="settle-warns">' + warns.map((w) => '<div>' + I.icon('info') + '<span>' + w + '</span></div>').join('') + '</div>' : '') +
      '</section>';
  }
  function tabAcerto(ui) {
    const h = E.settlementHistory();
    const c = E.settlementCalc(ui.month);
    const who = (p) => (p ? U.esc(E.PARTNERS[p]) : '');
    const pend = h.pendingDebtor
      ? '<b>' + who(h.pendingDebtor) + '</b> deve <b>' + U.money(Math.abs(h.pendingNet)) + '</b> para <b>' + who(h.pendingDebtor === 'karol' ? 'natasha' : 'karol') + '</b>'
      : 'Nenhum valor pendente entre as sócias';
    const rows = h.rows.length ? h.rows.map((r) => {
      const [cls, label] = settleState(r);
      return '<tr' + (r.month === ui.month ? ' class="row-on"' : '') + '><td><button class="link-btn" data-act="exp-month" data-month="' + r.month + '">' + U.esc(U.monthLabel(r.month)) + '</button><div class="cell-sub">acerto em ' + U.dateBR(r.date) + '</div></td>' +
        '<td class="r tnum">' + U.money(r.karol) + '</td><td class="r tnum">' + U.money(r.natasha) + '</td><td class="r tnum"><b>' + U.money(r.total) + '</b></td><td class="r tnum">' + U.money(r.share) + '</td>' +
        '<td>' + (r.debtor ? who(r.debtor) + ' → ' + who(r.creditor) + ' <b class="tnum">' + U.money(r.amount) + '</b>' : '<span class="muted">—</span>') + '</td>' +
        '<td><span class="pill ' + cls + '">' + label + '</span>' + (r.record && r.record.date ? '<div class="cell-sub">' + (r.done ? 'transferido ' : 'previsto ') + U.dateBR(r.record.date) + (r.record.amount ? ' · ' + U.money(r.record.amount) : '') + '</div>' : '') + '</td>' +
        '<td class="r"><button class="btn sm" data-act="settle-open" data-month="' + r.month + '">' + (r.record ? I.icon('edit') + 'Editar' : I.icon('cash') + 'Registrar') + '</button></td></tr>';
    }).join('') : '<tr><td colspan="8">' + I.empty('Os fechamentos aparecem aqui conforme as despesas são lançadas.', 'calendar') + '</td></tr>';
    return settlePanel(ui.month) +
      '<div class="total-band card"><div><div class="eyebrow light">Saldo pendente entre as sócias · até ' + U.esc(U.monthLabel(U.currentYm(), { noYear: true })) + '</div><div class="tb-value" style="font-size:clamp(1.4rem,3vw,2rem)">' + pend + '</div></div>' +
      '<div class="tb-split"><div><span>Fechamentos</span><b>' + h.rows.filter((r) => r.month <= U.currentYm()).length + '</b></div><div><span>Concluídos</span><b>' + h.rows.filter((r) => r.done).length + '</b></div></div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Histórico de fechamentos</h2><p>Cada mês tem o seu controle. Clique no mês para ver as contas dele; um fechamento não muda quando começa o mês seguinte.</p></div></div>' +
      '<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Mês</th><th class="r">Karol pagou</th><th class="r">Natasha pagou</th><th class="r">Total</th><th class="r">Parte de cada</th><th>Quem deve</th><th>Acerto</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Quem pagou o quê em ' + U.esc(U.monthLabel(ui.month, { noYear: true })) + '</h2><p>Para trocar o responsável de uma conta só neste mês, use o seletor.</p></div></div>' +
      '<div class="grid-2" style="padding:12px 16px 16px;gap:16px">' + ['karol', 'natasha'].map((p) => {
        const l = c.list.filter((e) => E.payerOf(e) === p);
        return '<div><div class="lbl-sm">' + payerChip(p) + ' ' + U.money(p === 'karol' ? c.karol : c.natasha) + '</div>' + (l.length ? '<div class="list">' + l.map((e) => '<div class="list-item" style="padding:8px 0"><div class="grow"><div class="cell-name">' + U.esc(e.name) + instLabel(e) + '</div><div class="cell-sub">' + U.esc(E.TYPES[e.type] || '') + ' · ' + U.esc(E.STATUS[E.effStatus(e)]) + '</div></div><b class="tnum">' + U.money(e.status === 'pago' ? E.paidValue(e) : e.amount) + '</b>' + payerSelect(e) + '</div>').join('') + '</div>' : '<div class="muted small">Nenhuma conta.</div>') + '</div>';
      }).join('') + '</div>' +
      (c.unassigned.length ? '<div style="padding:0 16px 16px"><div class="lbl-sm">' + payerChip('') + '</div>' + c.unassigned.map((e) => '<div class="list-item" style="padding:8px 0"><div class="grow"><div class="cell-name">' + U.esc(e.name) + '</div></div><b class="tnum">' + U.money(e.amount) + '</b>' + payerSelect(e) + '</div>').join('') + '</div>' : '') + '</div>';
  }

  function settleModal(month) {
    const c = E.settlementCalc(month);
    const r = c.record || {};
    const from = r.from || c.debtor || 'natasha';
    const amount = r.amount != null ? r.amount : c.amount;
    const pOpts = (cur) => Object.keys(E.PARTNERS).map((k) => opt(k, E.PARTNERS[k], cur)).join('');
    I.modal({
      title: 'Registrar acerto de ' + U.monthLabel(month, { noYear: true }),
      sub: 'Transferência entre as sócias. Não conta como despesa da agência.',
      body: '<div class="notice">' + I.icon('info') + '<span>Cálculo do mês: total ' + U.money(c.total) + ', parte de cada uma ' + U.money(c.share) + '. ' + resultText(c) + '</span></div>' +
        '<form id="st-form" class="form-grid" novalidate>' +
        '<div class="field"><label for="st-date">Data da transferência</label><input class="input" type="date" id="st-date" name="date" value="' + U.esc(r.date || c.date) + '"></div>' +
        '<div class="field"><label for="st-amt">Valor transferido</label><input class="input tnum" id="st-amt" name="amount" inputmode="decimal" value="' + U.esc(String(amount).replace('.', ',')) + '"></div>' +
        '<div class="field"><label for="st-from">Quem transferiu</label><select class="input" id="st-from" name="from">' + pOpts(from) + '</select></div>' +
        '<div class="field"><label for="st-to">Quem recebeu</label><select class="input" id="st-to" name="to">' + pOpts(r.to || (from === 'karol' ? 'natasha' : 'karol')) + '</select></div>' +
        '<div class="field"><label for="st-status">Status do acerto</label><select class="input" id="st-status" name="status">' + Object.keys(E.SETTLE_STATUS).map((k) => opt(k, E.SETTLE_STATUS[k], r.status || 'concluido')).join('') + '</select></div>' +
        '<div class="field full"><label for="st-notes">Observação</label><input class="input" id="st-notes" name="notes" value="' + U.esc(r.notes || '') + '" placeholder="Opcional"></div></form>',
      foot: (c.record ? '<button class="btn danger" data-del>' + I.icon('trash') + 'Remover registro</button><span class="spacer"></span>' : '') + '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-save>' + I.icon('check') + 'Salvar acerto</button>',
      onMount(el, close) {
        const f = el.querySelector('#st-form');
        f.from.addEventListener('change', () => { f.to.value = f.from.value === 'karol' ? 'natasha' : 'karol'; });
        f.to.addEventListener('change', () => { f.from.value = f.to.value === 'karol' ? 'natasha' : 'karol'; });
        const del = el.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => { if (await E.deleteSettlement(month)) close(); });
        el.querySelector('[data-save]').addEventListener('click', async () => {
          const d = I.formData(f);
          if (d.from === d.to) { I.toast('Quem transferiu e quem recebeu precisam ser pessoas diferentes.', true); return; }
          if (d.status === 'concluido' && !d.date) { I.toast('Informe a data da transferência.', true); f.date.focus(); return; }
          if (d.status === 'concluido' && !(U.parseMoney(d.amount) > 0) && c.debtor) { I.toast('Informe o valor transferido.', true); f.amount.focus(); return; }
          if (await E.saveSettlement(month, d)) close();
        });
      },
    });
  }

  function render(root, ui) {
    const sm = E.monthSummary(ui.month);
    const tab = ui.desp.tab;
    const body = tab === 'acerto' ? tabAcerto(ui) : tab === 'variaveis' ? tabVariaveis(ui) : tab === 'cadastro' ? tabCadastro() : tab === 'calendario' ? tabCalendario(ui) : tab === 'relatorio' ? tabRelatorio(ui) : tabContas(ui);
    // Atrasadas primeiro (para não pagar o mês seguinte por engano), depois as próximas.
    const upcoming = S.state.expenseEntries.filter((e) => e.status !== 'pago' && e.dueDate).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)).slice(0, 6);
    root.innerHTML =
      '<div class="page-head"><div><div class="eyebrow">Contas a pagar</div><h1>Despesas</h1><p>Custos e saídas da agência, separados de mensalidades e jobs.</p></div>' +
      '<div class="row">' + V.views.painel.monthNav(ui.month) + '<button class="btn" data-act="exp-new-var">' + I.icon('plus') + 'Gasto variável</button><button class="btn primary cta" data-act="exp-new">' + I.icon('plus') + 'Adicionar despesa</button></div></div>' +
      kpis(sm) +
      (tab === 'contas' ? settlePanel(ui.month, true) : '') +
      (tab === 'contas' ? '<div class="grid-2"><div class="card"><div class="card-head"><div><h2>Despesas por categoria</h2><p>Onde estão concentrados os custos de ' + U.esc(U.monthLabel(ui.month, { noYear: true })) + '</p></div></div><div class="card-pad">' + categoryChart(sm) + '</div></div>' +
        '<div class="card"><div class="card-head"><div><h2>Contas em aberto</h2><p>Atrasadas e próximas, por data</p></div></div><div class="list" style="margin-top:10px">' +
        (upcoming.length ? upcoming.map((e) => '<div class="list-item">' + I.dateBox(e.dueDate) + '<div class="grow"><div class="title">' + U.esc(e.name) + instLabel(e) + '</div><div class="cell-sub">' + U.money(e.amount) + ' · ' + U.esc(U.monthLabel(e.month, { noYear: true })) + ' · ' + (E.isOverdue(e) ? '<span style="color:var(--bad);font-weight:600">venceu ' + U.relDays(e.dueDate) + '</span>' : U.relDays(e.dueDate)) + '</div></div><button class="btn sm" data-act="exp-pay" data-id="' + U.esc(e.id) + '">' + I.icon('check') + 'Pagar</button></div>').join('') : I.empty('Nenhuma conta com data pela frente. Defina as datas em "Definir data".', 'check')) +
        '</div></div></div>' : '') +
      '<div class="tabs" role="tablist">' + TABS.map(([k, l]) => '<button role="tab" data-act="exp-tab" data-val="' + k + '" aria-selected="' + (tab === k) + '">' + l + '</button>').join('') + '</div>' +
      body;
  }
  function renderResults(root, ui) {
    const tb = root.querySelector('[data-results]');
    if (tb && ui.desp.tab === 'contas') tb.innerHTML = entryRows(filteredEntries(ui)); else V.app.render();
  }

  /* ---------- Formulários ---------- */
  const methodOpts = (cur) => Object.keys(E.METHODS).map((k) => opt(k, E.METHODS[k], cur || '')).join('');
  const catList = (id, list) => '<datalist id="' + id + '">' + Array.from(new Set(list.concat(S.state.expenses.map((e) => e.category), S.state.expenseEntries.map((e) => e.category)).filter(Boolean))).map((c) => '<option value="' + U.esc(c) + '"></option>').join('') + '</datalist>';

  /** Nova despesa / editar cadastro recorrente. Tipos variável e eventual viram lançamento único. */
  function openForm(exp, presetType) {
    const isNew = !exp;
    const e = Object.assign({ name: '', category: '', type: presetType || 'fixa', amount: '', dueDay: '', payer: '', paymentMethod: '', startMonth: U.currentYm(), installmentCurrent: 1, installmentTotal: 12, notes: '', status: 'ativa' }, exp || {});
    const body =
      '<form id="exp-form" class="form-grid" novalidate>' +
      '<div class="field"><label for="x-name">Nome da despesa</label><input class="input" id="x-name" name="name" value="' + U.esc(e.name) + '" autofocus></div>' +
      '<div class="field"><label for="x-cat">Categoria</label><input class="input" id="x-cat" name="category" list="x-cats" value="' + U.esc(e.category) + '" placeholder="Ex.: Estrutura">' + catList('x-cats', E.CATEGORIES) + '</div>' +
      '<div class="field"><label for="x-type">Tipo de despesa</label><select class="input" id="x-type" name="type"' + (isNew ? '' : ' disabled') + '>' + Object.keys(E.TYPES).filter((k) => k !== 'eventual' || e.type === 'eventual').map((k) => opt(k, E.TYPES[k], e.type)).join('') + '</select></div>' +
      '<div class="field"><label for="x-amount" data-amt-label>Valor</label><input class="input tnum" id="x-amount" name="amount" inputmode="decimal" value="' + (e.amount !== '' ? U.esc(String(e.amount).replace('.', ',')) : '') + '" placeholder="0,00"></div>' +
      payerField(isNew ? 'Quem pagou essa despesa?' : 'Quem paga essa despesa?', E.PARTNERS[e.payer] ? e.payer : '') +
      '<div class="field" data-rec><label for="x-day">Dia do vencimento (todo mês)</label><input class="input tnum" id="x-day" name="dueDay" type="number" min="1" max="31" value="' + U.esc(e.dueDay || '') + '" placeholder="Deixe vazio se ainda não sabe"></div>' +
      '<div class="field" data-rec><label for="x-start">Primeiro mês lançado</label><input class="input" id="x-start" name="startMonth" type="month" value="' + U.esc(e.startMonth) + '"></div>' +
      '<div class="field" data-once><label for="x-due">Data de vencimento</label><input class="input" id="x-due" name="dueDate" type="date"></div>' +
      '<div class="field" data-once><label for="x-purchase">Data da compra</label><input class="input" id="x-purchase" name="purchaseDate" type="date" value="' + U.today() + '"></div>' +
      '<div class="field" data-once><label for="x-paid">Data de pagamento</label><input class="input" id="x-paid" name="paidAt" type="date"><span class="hint">Se preencher, o gasto já entra como pago.</span></div>' +
      '<div class="field"><label for="x-method">Forma de pagamento</label><select class="input" id="x-method" name="paymentMethod">' + methodOpts(e.paymentMethod) + '</select></div>' +
      '<div class="field"><label for="x-rec">Recorrência</label><select class="input" id="x-rec" name="recurrence" disabled><option value="mensal">Mensal</option><option value="unica">Única</option></select></div>' +
      '<div class="full form-grid inst-box" data-inst>' +
      '<div class="field"><label for="x-icur">Número da parcela atual</label><input class="input tnum" id="x-icur" name="installmentCurrent" type="number" min="1" value="' + U.esc(e.installmentCurrent || 1) + '"><span class="hint">Parcela que vence no primeiro mês lançado.</span></div>' +
      '<div class="field"><label for="x-itot">Quantidade total de parcelas</label><input class="input tnum" id="x-itot" name="installmentTotal" type="number" min="1" value="' + U.esc(e.installmentTotal || 1) + '"></div>' +
      '<div class="field full"><label class="check"><input type="checkbox" id="x-last"' + (e.installmentCurrent && e.installmentCurrent === e.installmentTotal ? ' checked' : '') + '><span>Esta é a última parcela (nenhuma cobrança será criada depois dela)</span></label></div></div>' +
      '<div class="field full"><label for="x-notes">Observações</label><textarea class="input" id="x-notes" name="notes" rows="2">' + U.esc(e.notes) + '</textarea></div>' +
      '</form>';
    I.modal({
      title: isNew ? 'Adicionar despesa' : 'Editar ' + e.name,
      sub: isNew ? 'Fixas, assinaturas e parcelas são lançadas todo mês, sem duplicar. Equipamentos e variáveis são lançamentos únicos.' : 'As alterações (inclusive quem paga) valem para os lançamentos em aberto a partir deste mês. Meses anteriores e acertos já feitos ficam como estão.',
      body,
      foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-save>' + I.icon('check') + (isNew ? 'Cadastrar' : 'Salvar') + '</button>',
      onMount(el, close) {
        const f = el.querySelector('#exp-form');
        const sync = () => {
          const type = f.type.value, rec = E.RECURRING.has(type);
          el.querySelectorAll('[data-rec]').forEach((x) => { x.hidden = !rec; });
          el.querySelectorAll('[data-once]').forEach((x) => { x.hidden = rec; });
          el.querySelector('[data-inst]').hidden = type !== 'parcela';
          f.recurrence.value = rec ? 'mensal' : 'unica';
          el.querySelector('[data-amt-label]').textContent = type === 'parcela' ? 'Valor da parcela' : rec ? 'Valor mensal' : 'Valor';
          if (!f.category.value && isNew) f.category.placeholder = type === 'assinatura' ? 'Ferramentas e assinaturas' : type === 'parcela' ? 'Equipamentos' : type === 'variavel' ? 'Mercado, transporte…' : 'Estrutura';
        };
        f.type.addEventListener('change', sync);
        el.querySelector('#x-last').addEventListener('change', (ev) => { if (ev.target.checked) f.installmentTotal.value = f.installmentCurrent.value; });
        f.installmentCurrent.addEventListener('input', () => { if (el.querySelector('#x-last').checked) f.installmentTotal.value = f.installmentCurrent.value; });
        sync();
        el.querySelector('[data-save]').addEventListener('click', async () => {
          const d = I.formData(f);
          d.type = f.type.value;
          if (!d.name.trim()) { I.toast('Informe o nome da despesa.', true); f.name.focus(); return; }
          if (!(U.parseMoney(d.amount) > 0)) { I.toast('Informe o valor.', true); f.amount.focus(); return; }
          if (!E.PARTNERS[d.payer]) { I.toast('Escolha quem pagou essa despesa: Karol ou Natasha.', true); el.querySelector('.payer-field').scrollIntoView({ block: 'center' }); return; }
          if (d.type === 'parcela' && Number(d.installmentCurrent) > Number(d.installmentTotal)) { I.toast('A parcela atual não pode ser maior que o total.', true); return; }
          const btn = el.querySelector('[data-save]'); btn.disabled = true;
          let id;
          if (E.RECURRING.has(d.type)) id = await E.saveExpense(Object.assign({}, exp || {}, d, { id: exp && exp.id, status: e.status, endedMonth: e.endedMonth }));
          else id = await E.saveEntry(Object.assign(d, { category: d.category || 'Outras compras' }));
          btn.disabled = false;
          if (id) close();
        });
      },
    });
  }

  /** Lançamento: gasto variável novo, ou detalhes/edição de qualquer lançamento do mês. */
  function entryForm(entryId, presetMonth) {
    const en = entryId ? E.entryById(entryId) : null;
    const isNew = !en;
    const d = Object.assign({ name: '', category: '', type: 'variavel', amount: '', dueDate: '', purchaseDate: '', paidAt: U.today(), paymentMethod: '', status: 'pago', notes: '' }, en || {});
    // Lançamento retroativo: olhando um mês passado, a data sugerida cai nesse mês.
    if (isNew && presetMonth && presetMonth < U.currentYm()) d.paidAt = presetMonth + '-' + U.pad(Math.min(28, new Date().getDate()));
    const payer = en ? E.payerOf(en) : '';
    const recurring = en && en.expenseId;
    const body =
      (recurring ? '<div class="notice">' + I.icon('info') + '<span>Lançamento de ' + U.esc(U.monthLabel(en.month)) + ' da despesa recorrente <b>' + U.esc(en.name) + '</b>' + (en.installmentNumber ? ' (parcela ' + en.installmentNumber + ' de ' + en.installmentTotal + ')' : '') + '. Mudanças aqui valem só para este mês.</span></div>' : '') +
      '<form id="en-form" class="form-grid" novalidate>' +
      '<div class="field"><label for="v-name">' + (recurring ? 'Nome' : 'O que foi comprado?') + '</label><input class="input" id="v-name" name="name" value="' + U.esc(d.name) + '"' + (isNew ? ' autofocus' : '') + '></div>' +
      '<div class="field"><label for="v-cat">Categoria</label><input class="input" id="v-cat" name="category" list="v-cats" value="' + U.esc(d.category) + '" placeholder="Ex.: Mercado">' + catList('v-cats', recurring ? E.CATEGORIES : E.VARIABLE_CATEGORIES) + '</div>' +
      (recurring ? '' : '<div class="field"><label for="v-type">Tipo</label><select class="input" id="v-type" name="type">' + opt('variavel', 'Variável', d.type) + opt('equipamento', 'Equipamento', d.type) + (d.type === 'eventual' ? opt('eventual', 'Compra eventual', d.type) : '') + '</select></div>') +
      '<div class="field"><label for="v-amount">' + (recurring ? 'Valor' : 'Qual foi o valor?') + '</label><input class="input tnum" id="v-amount" name="amount" inputmode="decimal" value="' + (d.amount !== '' ? U.esc(String(d.amount).replace('.', ',')) : '') + '" placeholder="0,00"></div>' +
      payerField(recurring ? 'Quem pagou neste mês?' : 'Quem pagou?', payer) +
      (recurring ? '' : '<div class="field"><label for="v-purchase">Data da compra</label><input class="input" id="v-purchase" name="purchaseDate" type="date" value="' + U.esc(d.purchaseDate || '') + '"></div>') +
      '<div class="field"' + (isNew ? ' data-advanced hidden' : '') + '><label for="v-due">Data de vencimento</label><input class="input" id="v-due" name="dueDate" type="date" value="' + U.esc(d.dueDate || '') + '"></div>' +
      '<div class="field"><label for="v-method">Forma de pagamento</label><select class="input" id="v-method" name="paymentMethod">' + methodOpts(d.paymentMethod) + '</select></div>' +
      '<div class="field"><label for="v-status">Status</label><select class="input" id="v-status" name="status">' + Object.keys(E.STATUS).filter((k) => k !== 'atraso').map((k) => opt(k, E.STATUS[k], d.status === 'atraso' ? 'pendente' : d.status)).join('') + '</select></div>' +
      '<div class="field" data-paidf><label for="v-paid">' + (recurring ? 'Data de pagamento' : 'Qual a data do pagamento?') + '</label><input class="input" id="v-paid" name="paidAt" type="date" value="' + U.esc(d.paidAt || U.today()) + '"></div>' +
      '<div class="field" data-paidf><label for="v-pamt">Valor pago</label><input class="input tnum" id="v-pamt" name="paidAmount" inputmode="decimal" value="' + U.esc(String(d.paidAmount != null ? d.paidAmount : (d.amount || '')).replace('.', ',')) + '"></div>' +
      '<div class="field full"><label for="v-notes">Descrição ou observação</label><textarea class="input" id="v-notes" name="notes" rows="2">' + U.esc(d.notes || '') + '</textarea></div></form>';
    I.modal({
      title: isNew ? 'Adicionar gasto' : d.name,
      sub: isNew ? 'Mercado, escritório, materiais de gravação, equipamentos, acessórios, manutenção e outros. O valor entra no acerto do mês da data do pagamento.' : U.esc(E.TYPES[d.type] || '') + ' · ' + U.esc(U.monthLabel(d.month)) + (recurring ? ' · trocar quem pagou aqui vale só para este mês' : ''),
      body,
      foot: (!isNew && !recurring ? '<button class="btn danger" data-del>' + I.icon('trash') + 'Excluir</button><span class="spacer"></span>' : '') + '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-save>' + I.icon('check') + (isNew ? 'Lançar' : 'Salvar') + '</button>',
      onMount(el, close) {
        const f = el.querySelector('#en-form');
        const sync = () => el.querySelectorAll('[data-paidf]').forEach((x) => { x.hidden = f.status.value !== 'pago'; });
        f.status.addEventListener('change', sync); sync();
        const del = el.querySelector('[data-del]');
        if (del) del.addEventListener('click', async () => { close(); confirmDeleteEntry(en.id); });
        el.querySelector('[data-save]').addEventListener('click', async () => {
          const x = I.formData(f);
          if (!x.name.trim()) { I.toast('Informe o nome do gasto.', true); f.name.focus(); return; }
          if (!(U.parseMoney(x.amount) > 0)) { I.toast('Informe o valor.', true); f.amount.focus(); return; }
          if (!E.PARTNERS[x.payer]) { I.toast('Escolha quem pagou: Karol ou Natasha.', true); el.querySelector('.payer-field').scrollIntoView({ block: 'center' }); return; }
          if (x.status === 'pago' && !x.paidAt) { I.toast('Informe a data do pagamento.', true); f.paidAt.focus(); return; }
          if (x.status !== 'pago') { x.paidAt = ''; x.paidAmount = ''; }
          const btn = el.querySelector('[data-save]'); btn.disabled = true;
          const id = await E.saveEntry(Object.assign(x, { id: en && en.id, type: recurring ? en.type : (x.type || 'variavel') }));
          btn.disabled = false;
          if (id) close();
        });
      },
    });
  }

  function payModal(id) {
    const en = E.entryById(id);
    if (!en) return;
    const last = en.installmentNumber && en.installmentNumber === en.installmentTotal;
    I.modal({
      title: 'Registrar pagamento', sub: U.esc(en.name) + (en.installmentNumber ? ' · parcela ' + en.installmentNumber + ' de ' + en.installmentTotal : '') + ' · ' + U.esc(U.monthLabel(en.month)),
      body: (last ? '<div class="notice">' + I.icon('check') + '<span>Esta é a <b>última parcela</b>. Ao pagar, o parcelamento fica quitado e nenhuma nova cobrança é criada.</span></div>' : '') +
        '<div class="form-grid"><div class="field"><label for="xp-date">Data do pagamento</label><input class="input" type="date" id="xp-date" value="' + U.today() + '"></div>' +
        '<div class="field"><label for="xp-amt">Valor pago</label><input class="input tnum" id="xp-amt" inputmode="decimal" value="' + U.esc(String(en.amount).replace('.', ',')) + '"></div></div>',
      foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>' + I.icon('check') + 'Confirmar pagamento</button>',
      onMount(el, close) {
        el.querySelector('[data-ok]').addEventListener('click', async () => {
          if (await E.setEntryStatus(id, 'pago', { paidAt: el.querySelector('#xp-date').value || U.today(), paidAmount: el.querySelector('#xp-amt').value })) close();
        });
      },
    });
  }

  async function confirmDeleteEntry(id) {
    const en = E.entryById(id);
    if (!en) return;
    const ok = await I.confirmDialog({ title: 'Excluir lançamento?', danger: true, ok: 'Excluir', text: '<b>' + U.esc(en.name) + '</b> · ' + U.money(en.amount) + ' será removido de ' + U.esc(U.monthLabel(en.month)) + '.' });
    if (ok) E.deleteEntry(id);
  }
  async function confirmDelete(id) {
    const e = E.expenseById(id);
    if (!e) return;
    const res = await I.confirmDialog({
      title: 'Excluir ' + e.name + '?', danger: true, ok: 'Excluir despesa',
      text: 'O cadastro e os lançamentos em aberto serão removidos. Para apenas parar os próximos meses, use <b>' + (e.type === 'assinatura' ? 'Cancelar' : 'Encerrar') + '</b>.',
      extra: '<label class="check"><input type="checkbox" id="keep-paid" checked><span>Manter no histórico os lançamentos já pagos</span></label>',
      read: (el) => ({ keep: el.querySelector('#keep-paid').checked }),
    });
    if (res) E.deleteExpense(id, res.keep);
  }
  async function confirmEnd(id) {
    const e = E.expenseById(id);
    if (!e) return;
    const cur = U.currentYm();
    const res = await I.confirmDialog({
      title: (e.type === 'assinatura' ? 'Cancelar ' : 'Encerrar ') + e.name + '?', ok: e.type === 'assinatura' ? 'Cancelar assinatura' : 'Encerrar',
      text: 'Escolha o último mês que ainda deve ser lançado. Os meses seguintes deixam de ser gerados; o histórico continua.',
      extra: '<div class="field"><label for="end-m">Último mês</label><select class="input" id="end-m">' + opt(U.addMonths(cur, -1), U.monthLabel(U.addMonths(cur, -1)) + ' (já não lançar este mês)', '') + opt(cur, U.monthLabel(cur) + ' (este mês ainda conta)', cur) + '</select></div>',
      read: (el) => ({ m: el.querySelector('#end-m').value }),
    });
    if (res) E.endExpense(id, res.m);
  }

  V.views = V.views || {};
  V.views.despesas = { title: 'Despesas', render, renderResults, openForm, entryForm, payModal, settleModal, confirmDelete, confirmDeleteEntry, confirmEnd };
})(window.Vulpes = window.Vulpes || {});
