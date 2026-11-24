/* Painel: indicadores do mês, gráfico de recebimentos, próximos vencimentos, atrasos e atividades. */
(function (V) {
  'use strict';
  const U = V.util, S = V.store, I = V.ui;

  function monthNav(month) {
    return '<div class="row">' +
      '<button class="btn icon" data-act="month-prev" aria-label="Mês anterior">' + I.icon('left') + '</button>' +
      '<strong class="tnum" style="min-width:128px;text-align:center">' + U.esc(U.monthLabel(month)) + '</strong>' +
      '<button class="btn icon" data-act="month-next" aria-label="Próximo mês">' + I.icon('right') + '</button>' +
      (month !== U.currentYm() ? '<button class="btn sm ghost" data-act="month-today">Mês atual</button>' : '') +
      '</div>';
  }

  /* Gráfico: previsto acumulado (por vencimento) x recebido acumulado (por data de pagamento). */
  function chart(month) {
    const { y, m } = U.ymParts(month);
    const N = U.daysInMonth(y, m);
    const list = S.chargesOf(month);
    const exp = new Array(N + 1).fill(0), rec = new Array(N + 1).fill(0);
    const jexp = new Array(N + 1).fill(0), jrec = new Array(N + 1).fill(0);
    V.jobs.jobItems().forEach((i) => {
      if (i.dueDate && i.dueDate.slice(0, 7) === month) jexp[Number(i.dueDate.slice(8))] += i.amount;
      if (i.status === 'pago' && (i.paidAt || '').slice(0, 7) === month) jrec[Number(i.paidAt.slice(8))] += Number(i.paidAmount != null ? i.paidAmount : i.amount) || 0;
    });
    for (let d = 1; d <= N; d++) { exp[d] += jexp[d]; rec[d] += jrec[d]; }
    list.forEach((c) => {
      const dd = c.dueDate && c.dueDate.slice(0, 7) === month ? Number(c.dueDate.slice(8)) : (c.dueDate < month ? 1 : N);
      exp[dd] += Number(c.amount) || 0;
      if (c.status === 'pago' && c.paidAt) {
        const pd = c.paidAt.slice(0, 7) === month ? Number(c.paidAt.slice(8)) : (c.paidAt < month ? 1 : N);
        rec[pd] += Number(c.paidAmount != null ? c.paidAmount : c.amount) || 0;
      }
    });
    for (let d = 1; d <= N; d++) { exp[d] += exp[d - 1]; rec[d] += rec[d - 1]; }
    if (!exp[N] && !rec[N]) return '<div class="empty" style="padding:60px 20px">Nenhum vencimento ou recebimento neste mês.</div>';
    const total = exp[N] || 1;
    const step = total > 20000 ? 5000 : total > 8000 ? 2000 : 1000;
    const maxY = Math.max(step, Math.ceil(total / step) * step);
    const W = 640, H = 230, L = 52, R = 14, T = 14, B = 28;
    const x = (d) => L + ((d - 1) / Math.max(1, N - 1)) * (W - L - R);
    const yy = (v) => T + (1 - v / maxY) * (H - T - B);
    const isCur = month === U.currentYm();
    const todayD = isCur ? new Date().getDate() : (month < U.currentYm() ? N : 0);
    let grid = '';
    for (let v = 0; v <= maxY; v += step) {
      grid += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy(v) + '" y2="' + yy(v) + '" stroke="var(--line)" stroke-width="1"/>' +
        '<text x="' + (L - 8) + '" y="' + (yy(v) + 4) + '" text-anchor="end">' + U.moneyShort(v) + '</text>';
    }
    const ticks = [1, 5, 10, 15, 20, 25, N].filter((d, i, a) => a.indexOf(d) === i && d <= N);
    ticks.forEach((d) => { grid += '<text x="' + x(d) + '" y="' + (H - 8) + '" text-anchor="middle">' + d + '</text>'; });
    let expPath = 'M' + x(1) + ',' + yy(exp[1]);
    for (let d = 2; d <= N; d++) expPath += ' H' + x(d) + ' V' + yy(exp[d]);
    const recEnd = todayD || 0;
    let recPath = '', area = '';
    if (recEnd >= 1) {
      recPath = 'M' + x(1) + ',' + yy(rec[1]);
      for (let d = 2; d <= recEnd; d++) recPath += ' H' + x(d) + ' V' + yy(rec[d]);
      area = recPath + ' V' + yy(0) + ' H' + x(1) + ' Z';
    }
    const dots = [];
    for (let d = 1; d <= N; d++) if (exp[d] !== exp[d - 1]) dots.push('<circle cx="' + x(d) + '" cy="' + yy(exp[d]) + '" r="3" fill="var(--surface)" stroke="var(--accent)" stroke-width="1.5"><title>Dia ' + d + ': ' + U.money(exp[d] - exp[d - 1]) + ' a vencer</title></circle>');
    const todayLine = isCur ? '<line x1="' + x(todayD) + '" x2="' + x(todayD) + '" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--ink)" stroke-dasharray="2 3" opacity=".35"/><text x="' + x(todayD) + '" y="' + (T + 8) + '" text-anchor="' + (todayD > N - 3 ? 'end' : 'middle') + '" style="font-weight:600;fill:var(--ink-2)">hoje</text>' : '';
    const endDot = recEnd >= 1 ? '<circle cx="' + x(recEnd) + '" cy="' + yy(rec[recEnd]) + '" r="4.5" fill="var(--ok)" stroke="var(--surface)" stroke-width="2"/>' : '';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Recebimentos acumulados no mês">' + grid +
      (area ? '<path d="' + area + '" fill="var(--ok)" opacity=".12"/>' : '') +
      '<path d="' + expPath + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/>' +
      (recPath ? '<path d="' + recPath + '" fill="none" stroke="var(--ok)" stroke-width="2.4"/>' : '') +
      dots.join('') + todayLine + endDot + '</svg>';
  }

  function render(root, ui) {
    const month = ui.month;
    const s = S.monthSummary(month);
    const t = U.today();
    const active = S.retainerClients();
    const allLate = S.allOverdue();
    const olderLate = allLate.filter((c) => c.month < month);
    const pct = s.expected ? Math.round((s.received / s.expected) * 100) : 0;

    const items = V.jobs.allItems();
    const jm = V.jobs.monthJobs(month);
    const upcoming = items.filter((c) => c.status !== 'pago' && c.dueDate && c.dueDate >= t)
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0)).slice(0, 7);
    const allLateItems = items.filter((c) => S.isOverdue(c, t));
    const kindTag = (c) => (c.kind === 'job' ? '<span class="kind-tag">Job</span> ' : '');
    const totalReceived = s.received + jm.received;
    const totalExpected = s.expected + jm.dueInMonth;
    const next = upcoming[0];
    const xs = V.expenses.monthSummary(month);
    // Saldo = o que entrou de fato (mensalidades + jobs pagos) menos o que saiu de fato (despesas pagas no mês).
    const saldo = Math.round((totalReceived - xs.paidCash) * 100) / 100;
    // Projeção = toda a receita prevista do mês menos todas as despesas previstas do mês.
    const projecao = Math.round((totalExpected - xs.expected) * 100) / 100;
    const sign = (v) => (v < 0 ? ' neg' : '');

    const kpi = (cls, ic, label, value, sub) => '<div class="card kpi ' + cls + '"><div class="k-label"><span class="k-icon">' + I.icon(ic) + '</span>' + label + '</div><div class="k-value">' + value + '</div><div class="k-sub">' + sub + '</div></div>';

    const upHtml = upcoming.length ? upcoming.map((c) => {
      const st = S.effStatus(c);
      return '<div class="list-item">' + I.dateBox(c.dueDate) +
        '<div class="grow"><div class="title">' + kindTag(c) + U.esc(c.clientName) + '</div><div class="cell-sub">' + U.money(c.amount) + ' · ' + (c.kind === 'job' ? U.esc(c.title) : (c.paymentMethod === 'pix' ? 'PIX' : 'Boleto')) + ' · ' + U.relDays(c.dueDate) + '</div></div>' +
        (st === 'enviada' ? I.statusPill(st) : '<button class="btn sm" data-act="msg" data-id="' + U.esc(c.id) + '">' + I.icon('chat') + 'Cobrar</button>') + '</div>';
    }).join('') : I.empty('Nenhum vencimento em aberto pela frente.', 'check');

    const lateHtml = allLateItems.length ? allLateItems.sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)).slice(0, 6).map((c) =>
      '<div class="list-item">' + I.dateBox(c.dueDate) +
      '<div class="grow"><div class="title">' + kindTag(c) + U.esc(c.clientName) + '</div><div class="cell-sub">' + U.money(c.amount) + (c.kind === 'job' ? ' · ' + U.esc(c.title) : '') + ' · venceu ' + U.relDays(c.dueDate) + (c.sentAt ? ' · cobrado ' + U.timeAgo(c.sentAt) : '') + '</div></div>' +
      '<div class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn sm" data-act="pay" data-id="' + U.esc(c.id) + '" title="Registrar pagamento">' + I.icon('check') + '</button>' +
      '<button class="btn sm primary" data-act="msg" data-id="' + U.esc(c.id) + '">' + I.icon('chat') + 'Cobrar</button></div></div>').join('')
      : I.empty('Nenhum pagamento em atraso.', 'check');

    const acts = S.state.activity.slice(0, 8);
    const actIcon = { payment: ['cash', 'ok'], sent: ['send', 'info'], status: ['receipt', ''], client: ['users', ''], settings: ['settings', ''], job: ['briefcase', ''], expense: ['wallet', ''], expense_paid: ['cash', 'bad'], settlement: ['users', 'info'] };
    const actHtml = acts.length ? acts.map((a) => {
      const [ic, cls] = actIcon[a.type] || ['info', ''];
      return '<div class="list-item"><span class="act-icon ' + cls + '">' + I.icon(ic) + '</span><div class="grow"><div style="overflow-wrap:anywhere">' + U.esc(a.text) + '</div>' +
        '<div class="cell-sub">' + U.timeAgo(a.at) + (a.amount ? ' · ' + U.money(a.amount) : '') + '</div></div></div>';
    }).join('') : I.empty('As atividades aparecem aqui conforme você registra pagamentos e cobranças.', 'clock');

    root.innerHTML =
      '<div class="page-head"><div><div class="eyebrow">Resumo financeiro</div><h1>' + U.esc(U.monthLabel(month)) + '</h1>' +
      '<p>' + s.paidCount + ' de ' + s.list.length + ' mensalidades pagas · ' + pct + '% da receita prevista recebida</p></div>' +
      '<div class="row">' + monthNav(month) + '<a class="btn primary" href="#cobrancas">' + I.icon('chat') + 'Central de Cobranças</a></div></div>' +

      '<div class="total-band card"><div><div class="eyebrow light">Faturamento total do mês · mensalidades + jobs</div><div class="tb-value">' + U.money(totalReceived) + '<span> recebidos</span></div></div>' +
      '<div class="tb-split"><div><span>Mensalidades</span><b>' + U.money(s.received) + '</b></div><div><span>Jobs</span><b>' + U.money(jm.received) + '</b></div><div><span>Previsto no mês</span><b>' + U.money(totalExpected) + '</b></div></div></div>' +
      '<div class="total-band card saldo-band"><div><div class="eyebrow light">Saldo do mês · recebido − despesas pagas</div><div class="tb-value' + sign(saldo) + '">' + U.money(saldo) + '</div></div>' +
      '<div class="tb-split"><div><span>Entrou (recebido)</span><b>' + U.money(totalReceived) + '</b></div><div><span>Saiu (despesas pagas)</span><b>' + U.money(xs.paidCash) + '</b></div><div><span>Resultado previsto</span><b class="' + sign(projecao).trim() + '">' + U.money(projecao) + '</b></div></div></div>' +
      '<div class="section-label"><span>Mensalidades recorrentes</span></div>' +
      '<div class="kpis">' +
      kpi('dark', 'trend', 'Receita prevista', U.money(s.expected), s.list.length + ' mensalidades no mês') +
      kpi('ok', 'wallet', 'Recebido no mês', U.money(s.received), pct + '% do previsto') +
      kpi('warn', 'clock', 'Pendente', U.money(s.pending), s.pendingCount + (s.pendingCount === 1 ? ' mensalidade a vencer' : ' mensalidades a vencer')) +
      kpi(s.lateCount ? 'bad' : '', 'alert', 'Em atraso', U.money(s.late), s.lateCount + ' no mês' + (olderLate.length ? ' · +' + U.money(olderLate.reduce((a, c) => a + c.amount, 0)) + ' de meses anteriores' : '')) +
      kpi('', 'users', 'Clientes com mensalidade', String(active.length), U.money(active.reduce((a, c) => a + (Number(c.amount) || 0), 0)) + ' por mês') +
      kpi('', 'calendar', 'Próximo vencimento', next ? U.esc(U.dateShort(next.dueDate)) : '—', next ? U.esc(next.clientName) + (next.kind === 'job' ? ' (job)' : '') + ' · ' + U.relDays(next.dueDate) : 'Nada em aberto') +
      '</div>' +
      '<div class="section-label"><span>Jobs · serviços adicionais</span><a class="btn sm ghost" href="#jobs">Ver jobs</a></div>' +
      '<div class="kpis kpis-4">' +
      kpi('', 'briefcase', 'Contratado no mês', U.money(jm.contracted), jm.contractedCount + (jm.contractedCount === 1 ? ' job novo' : ' jobs novos')) +
      kpi('ok', 'wallet', 'Recebido em jobs', U.money(jm.received), jm.receivedCount + (jm.receivedCount === 1 ? ' parcela paga no mês' : ' parcelas pagas no mês')) +
      kpi(jm.lateCount ? 'bad' : 'warn', 'clock', 'Pendente em jobs', U.money(jm.pending), jm.pendingCount + ' parcelas em aberto' + (jm.lateCount ? ' · ' + jm.lateCount + ' em atraso' : '')) +
      kpi('', 'trend', 'Jobs em andamento', String(jm.running), 'ainda não quitados') +
      '</div>' +

      '<div class="section-label"><span>Despesas · contas a pagar</span><a class="btn sm ghost" href="#despesas">Ver despesas</a></div>' +
      '<div class="kpis kpis-4">' +
      kpi('dark', 'receipt', 'Despesas previstas', U.money(xs.expected), xs.list.length + ' lançamentos no mês') +
      kpi('ok', 'check', 'Despesas pagas', U.money(xs.paid), xs.paidCount + ' de ' + xs.list.length + ' contas pagas') +
      kpi(xs.lateCount ? 'bad' : 'warn', xs.lateCount ? 'alert' : 'clock', 'Despesas pendentes', U.money(xs.pending + xs.late), xs.lateCount ? xs.lateCount + ' em atraso (' + U.money(xs.late) + ')' : (xs.soonCount ? xs.soonCount + ' vencem nos próximos dias' : 'nada atrasado')) +
      kpi(projecao < 0 ? 'neg' : 'pos', 'trend', 'Resultado previsto', U.money(projecao), U.money(totalExpected) + ' a receber − ' + U.money(xs.expected) + ' em despesas') +
      '</div>' +

      '<div class="grid-2">' +
      '<div class="card"><div class="card-head"><div><h2>Recebimentos ao longo do mês</h2><p>Mensalidades e parcelas de jobs, acumulados por dia</p></div>' +
      '<div class="legend"><span><i style="background:var(--accent)"></i>Previsto (vencimentos)</span><span><i style="background:var(--ok)"></i>Recebido</span></div></div>' +
      '<div class="card-pad">' + chart(month) + '</div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Próximos vencimentos</h2><p>Mensalidades em aberto, por data</p></div><a class="btn sm ghost" href="#calendario">Calendário</a></div><div class="list" style="margin-top:10px">' + upHtml + '</div></div>' +
      '</div>' +

      '<div class="grid-2b">' +
      '<div class="card"><div class="card-head"><div><h2>Precisa de atenção</h2><p>Pagamentos vencidos e não confirmados</p></div>' + (allLateItems.length ? '<span class="pill s-atraso">' + allLateItems.length + '</span>' : '') + '</div><div class="list" style="margin-top:10px">' + lateHtml + '</div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Atividades recentes</h2><p>Pagamentos registrados e cobranças realizadas</p></div></div><div class="list" style="margin-top:10px">' + actHtml + '</div></div>' +
      '</div>';
  }

  V.views = V.views || {};
  V.views.painel = { title: 'Painel', render, monthNav };
})(window.Vulpes = window.Vulpes || {});
