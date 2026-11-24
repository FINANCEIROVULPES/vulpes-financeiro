/* Calendário financeiro: grade mensal com vencimentos, feriados e destaques de atraso e proximidade. */
(function (V) {
  'use strict';
  const U = V.util, S = V.store, I = V.ui, C = V.cal;

  function render(root, ui) {
    const month = ui.month;
    const { y, m } = U.ymParts(month);
    const s = S.settings();
    const t = U.today();
    const soonLimit = U.addDays(t, Number(s.soonDays) || 5);
    const list = S.chargesOf(month).map(V.jobs.fromCharge).concat(V.jobs.jobItems().filter((i) => i.month === month))
      .filter((c) => (!ui.cal.method || c.paymentMethod === ui.cal.method) && (!ui.cal.kind || c.kind === ui.cal.kind));
    const byDay = new Map();
    list.forEach((c) => { const k = c.dueDate; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(c); });
    byDay.forEach((arr) => arr.sort((a, b) => U.norm(a.clientName).localeCompare(U.norm(b.clientName))));

    const ev = (c) => {
      const st = S.effStatus(c, t);
      const soon = c.status !== 'pago' && c.dueDate >= t && c.dueDate <= soonLimit;
      return '<button class="ev s-' + st + (soon ? ' soon' : '') + (c.kind === 'job' ? ' is-job' : '') + '" data-act="cal-ev" data-id="' + U.esc(c.key) + '" title="' + U.esc(c.clientName + (c.kind === 'job' ? ' · Job: ' + c.ref : '') + ' · ' + U.money(c.amount) + ' · ' + S.STATUS[st]) + '">' +
        '<b>' + (c.kind === 'job' ? '<i class="ev-job">JOB</i>' : '') + U.esc(c.clientName) + '</b><span>' + U.money(c.amount) + ' · ' + (c.kind === 'job' ? U.esc(c.title) : (c.paymentMethod === 'pix' ? 'PIX' : 'Boleto')) + '</span></button>';
    };

    // Grade começando no domingo.
    const first = new Date(y, m - 1, 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    const last = new Date(y, m, 0);
    const end = new Date(last); end.setDate(last.getDate() + (6 - last.getDay()));
    let cells = U.WEEKDAYS_SHORT.map((d) => '<div class="cal-dow">' + d + '</div>').join('');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = U.ymd(d);
      const out = d.getMonth() !== m - 1;
      const hol = C.holidayName(k, s.bankDays);
      const dow = d.getDay();
      const items = out ? [] : (byDay.get(k) || []);
      const total = items.reduce((a, c) => a + c.amount, 0);
      cells += '<div class="cal-day' + (out ? ' out' : '') + (k === t ? ' today' : '') + (hol && !out ? ' holiday' : '') + ((dow === 0 || dow === 6) && !out ? ' weekend' : '') + '">' +
        '<div class="d-top"><span class="d-num">' + d.getDate() + '</span>' + (items.length > 1 ? '<span class="d-total">' + U.moneyShort(total) + '</span>' : '') + '</div>' +
        (hol && !out ? '<div class="d-hol" title="' + U.esc(hol) + '">' + U.esc(hol) + '</div>' : '') +
        items.map(ev).join('') + '</div>';
    }

    // Agenda (telas pequenas).
    const days = Array.from(byDay.keys()).sort();
    const agenda = days.length ? days.map((k) => '<div class="list-item" style="align-items:flex-start">' + I.dateBox(k) +
      '<div class="grow" style="display:grid;gap:6px"><div class="cell-sub">' + U.esc(U.weekday(k)) + (C.holidayName(k, s.bankDays) ? ' · ' + U.esc(C.holidayName(k, s.bankDays)) : '') + '</div>' +
      byDay.get(k).map(ev).join('') + '</div></div>').join('') : I.empty('Nenhum vencimento neste mês.', 'calendar');

    const bd5 = C.nthBusinessDay(y, m, 5, s.bankDays);
    const hols = Array.from(C.holidays(y, s.bankDays).entries()).filter(([k]) => k.slice(0, 7) === month).sort();
    const sum = S.monthSummary(month);
    const jm = V.jobs.monthJobs(month);
    const kindBtn = (v, l) => '<button type="button" data-act="cal-kind" data-val="' + v + '" aria-pressed="' + ((ui.cal.kind || '') === v) + '">' + l + '</button>';
    const methodBtn = (v, l) => '<button type="button" data-act="cal-method" data-val="' + v + '" aria-pressed="' + (ui.cal.method === v) + '">' + l + '</button>';

    root.innerHTML =
      '<div class="page-head"><div><div class="eyebrow">Calendário financeiro</div><h1>' + U.esc(U.monthLabel(month)) + '</h1>' +
      '<p>5º dia útil: <b>' + U.dateBR(bd5) + '</b> (' + U.esc(U.weekday(bd5)) + ')' + (hols.length ? ' · Feriados: ' + hols.map(([k, n]) => U.esc(n) + ' (' + Number(k.slice(8)) + ')').join(', ') : '') + '</p></div>' +
      '<div class="row">' + V.views.painel.monthNav(month) + '<div class="seg" role="group" aria-label="Forma de pagamento">' + methodBtn('', 'Todas') + methodBtn('pix', 'PIX') + methodBtn('boleto', 'Boleto') + '</div>' +
      '<div class="seg" role="group" aria-label="Tipo">' + kindBtn('', 'Tudo') + kindBtn('mensalidade', 'Mensalidades') + kindBtn('job', 'Jobs') + '</div></div></div>' +
      '<div class="row small muted" style="gap:16px">' +
      '<span><span class="pill s-aguardando">Aguardando</span></span><span><span class="pill s-pago">Pago</span></span><span><span class="pill s-atraso">Em atraso</span></span><span><span class="pill s-enviada">Cobrança enviada</span></span>' +
      '<span>Contorno âmbar: vence em até ' + (Number(s.soonDays) || 5) + ' dias</span><span class="spacer"></span>' +
      '<span>Previsto <b class="tnum" style="color:var(--ink)">' + U.money(sum.expected + jm.dueInMonth) + '</b> · Recebido <b class="tnum" style="color:var(--ok)">' + U.money(sum.received + jm.received) + '</b></span></div>' +
      '<div class="card cal-grid-card" style="overflow:hidden"><div class="cal">' + cells + '</div><div class="list cal-agenda">' + agenda + '</div></div>';
  }

  function eventModal(id) {
    if (String(id).startsWith('j:')) { V.views.jobs.detail(String(id).split(':')[1]); return; }
    const c = S.state.charges.find((x) => x.id === id);
    if (!c) return;
    const st = S.effStatus(c);
    I.modal({
      title: c.clientName,
      sub: U.esc(U.monthLabel(c.month)) + ' · vencimento ' + U.dateBR(c.dueDate) + ' (' + U.esc(U.weekday(c.dueDate)) + ')',
      body: '<div class="row" style="gap:14px"><div class="kpi" style="padding:0"><div class="k-label">Valor</div><div class="k-value">' + U.money(c.amount) + '</div></div><span class="spacer"></span>' + I.methodTag(c.paymentMethod) + I.statusPill(st) + '</div>' +
        (c.status === 'pago' ? '<div class="notice">' + I.icon('check') + '<span>Recebido em ' + U.dateBR(c.paidAt) + (c.paidAmount != null ? ' · ' + U.money(c.paidAmount) : '') + '.</span></div>' : '') +
        (c.notes ? '<div class="small"><b>Anotações:</b> ' + U.esc(c.notes) + '</div>' : ''),
      foot: '<button class="btn" data-close>Fechar</button><button class="btn" data-go="edit">' + I.icon('edit') + 'Editar</button>' +
        (c.status !== 'pago' ? '<button class="btn" data-go="pay">' + I.icon('check') + 'Registrar pagamento</button><button class="btn primary" data-go="msg">' + I.icon('chat') + 'Gerar mensagem</button>' : ''),
      onMount(el, close) {
        el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
          close();
          const g = b.dataset.go;
          if (g === 'edit') V.views.pagamentos.editModal(id);
          if (g === 'pay') V.views.pagamentos.payModal(id);
          if (g === 'msg') V.views.cobrancas.messageModal(id);
        }));
      },
    });
  }

  V.views = V.views || {};
  V.views.calendario = { title: 'Calendário', render, eventModal };
})(window.Vulpes = window.Vulpes || {});
