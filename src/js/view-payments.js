/* Pagamentos: mensalidades por mês com filtros, status editável, registro de recebimento e histórico. */
(function (V) {
  'use strict';
  const U = V.util, S = V.store, I = V.ui;

  const PERIODS = [
    ['', 'Qualquer vencimento'], ['d1', 'Dias 1 a 10'], ['d2', 'Dias 11 a 20'], ['d3', 'Dia 21 em diante'],
    ['next7', 'Vence nos próximos 7 dias'], ['overdue', 'Já venceu'], ['range', 'Intervalo de datas…'],
  ];

  function months() {
    const set = new Set(S.state.charges.map((c) => c.month));
    set.add(U.currentYm());
    return Array.from(set).sort().reverse();
  }

  function filtered(f) {
    const t = U.today();
    const q = U.norm(f.q);
    return S.state.charges.filter((c) => {
      if (f.month && c.month !== f.month) return false;
      if (f.client && c.clientId !== f.client) return false;
      if (q && !U.norm(c.clientName).includes(q)) return false;
      if (f.method && c.paymentMethod !== f.method) return false;
      if (f.status && S.effStatus(c, t) !== f.status) return false;
      const day = Number((c.dueDate || '').slice(8));
      switch (f.period) {
        case 'd1': if (day > 10) return false; break;
        case 'd2': if (day < 11 || day > 20) return false; break;
        case 'd3': if (day < 21) return false; break;
        case 'next7': if (c.dueDate < t || c.dueDate > U.addDays(t, 7)) return false; break;
        case 'overdue': if (c.dueDate >= t) return false; break;
        case 'range': if ((f.from && c.dueDate < f.from) || (f.to && c.dueDate > f.to)) return false; break;
        default: break;
      }
      return true;
    }).sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : U.norm(a.clientName).localeCompare(U.norm(b.clientName))));
  }

  function results(f) {
    const list = filtered(f);
    const t = U.today();
    const sum = (arr) => arr.reduce((a, c) => a + (Number(c.amount) || 0), 0);
    const paid = list.filter((c) => c.status === 'pago');
    const late = list.filter((c) => S.isOverdue(c, t));
    const open = list.filter((c) => c.status !== 'pago' && !S.isOverdue(c, t));
    const strip = '<div class="row small muted" style="padding:12px 16px;border-bottom:1px solid var(--line);gap:18px">' +
      '<span><b class="tnum" style="color:var(--ink)">' + list.length + '</b> mensalidades</span>' +
      '<span>Total <b class="tnum" style="color:var(--ink)">' + U.money(sum(list)) + '</b></span>' +
      '<span>Pago <b class="tnum" style="color:var(--ok)">' + U.money(paid.reduce((a, c) => a + (c.paidAmount != null ? c.paidAmount : c.amount), 0)) + '</b></span>' +
      '<span>A vencer <b class="tnum" style="color:var(--warn)">' + U.money(sum(open)) + '</b></span>' +
      '<span>Em atraso <b class="tnum" style="color:var(--bad)">' + U.money(sum(late)) + '</b></span></div>';
    if (!list.length) return strip + I.empty('Nenhuma mensalidade encontrada com esses filtros.', 'receipt');
    const body = list.map((c) => {
      const client = S.clientById(c.clientId);
      return '<tr>' +
        '<td><div class="cell-name">' + U.esc(c.clientName) + '</div><div class="cell-sub">' + U.esc(U.monthLabel(c.month)) + (client ? '' : ' · cliente excluído') + '</div></td>' +
        '<td><div class="tnum">' + U.dateBR(c.dueDate) + '</div><div class="cell-sub">' + U.esc(U.weekday(c.dueDate)) + (c.status !== 'pago' ? ' · ' + U.relDays(c.dueDate) : '') + '</div></td>' +
        '<td class="r"><b>' + U.money(c.amount) + '</b></td>' +
        '<td>' + I.methodTag(c.paymentMethod) + '</td>' +
        '<td>' + I.statusSelect(c) + (c.sentAt ? '<div class="cell-sub" style="margin-top:4px">Cobrado ' + U.timeAgo(c.sentAt) + (c.sentCount > 1 ? ' (' + c.sentCount + 'x)' : '') + '</div>' : '') + '</td>' +
        '<td>' + (c.status === 'pago' ? '<div class="tnum">' + U.dateBR(c.paidAt) + '</div>' + (c.paidAmount != null && c.paidAmount !== c.amount ? '<div class="cell-sub">' + U.money(c.paidAmount) + '</div>' : '') : '<span class="muted">—</span>') + '</td>' +
        '<td><div class="actions">' +
        (c.status !== 'pago' ? '<button class="btn sm" data-act="pay" data-id="' + U.esc(c.id) + '">' + I.icon('check') + 'Pago</button><button class="btn sm" data-act="msg" data-id="' + U.esc(c.id) + '" title="Gerar mensagem de cobrança">' + I.icon('chat') + '</button>' : '') +
        '<button class="btn sm" data-act="edit-charge" data-id="' + U.esc(c.id) + '" title="Detalhes e edição">' + I.icon('edit') + '</button>' +
        '</div></td></tr>';
    }).join('');
    return strip + '<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Vencimento</th><th class="r">Valor</th><th>Forma</th><th>Status</th><th>Recebido em</th><th class="r">Ações</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function history() {
    const ms = months();
    if (!ms.length) return '';
    const rows = ms.map((m) => {
      const s = S.monthSummary(m);
      const pct = s.expected ? Math.round((s.received / s.expected) * 100) : 0;
      return '<tr><td><b>' + U.esc(U.monthLabel(m)) + '</b></td><td class="r">' + U.money(s.expected) + '</td><td class="r" style="color:var(--ok)">' + U.money(s.received) + '</td>' +
        '<td class="r" style="color:' + (s.late ? 'var(--bad)' : 'var(--muted)') + '">' + U.money(s.late) + '</td>' +
        '<td style="min-width:140px"><div style="height:6px;background:var(--line);border-radius:4px;overflow:hidden"><div style="height:100%;width:' + Math.min(100, pct) + '%;background:var(--ok)"></div></div><div class="cell-sub">' + pct + '% · ' + s.paidCount + '/' + s.list.length + ' pagas</div></td>' +
        '<td class="r"><button class="btn sm ghost" data-act="pick-month" data-month="' + m + '">Ver mês</button></td></tr>';
    }).join('');
    return '<div class="card"><div class="card-head"><div><h2>Histórico por mês</h2><p>Cada mês fica registrado. Um novo mês nunca apaga o anterior.</p></div></div>' +
      '<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Mês</th><th class="r">Previsto</th><th class="r">Recebido</th><th class="r">Em atraso</th><th>Progresso</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function render(root, ui) {
    const f = ui.payments;
    const opt = (v, l, cur) => '<option value="' + U.esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + U.esc(l) + '</option>';
    root.innerHTML =
      '<div class="page-head"><div><div class="eyebrow">Controle de pagamentos</div><h1>Mensalidades</h1><p>Altere o status direto na tabela. Ao marcar como pago, a data de recebimento é registrada. Os jobs têm controle próprio na aba Jobs.</p></div></div>' +
      '<div class="card">' +
      '<div class="toolbar">' +
      '<div class="search">' + I.icon('search') + '<input class="input" id="pg-q" type="search" placeholder="Busca rápida por cliente" value="' + U.esc(f.q) + '" data-filter="payments.q"></div>' +
      '<select class="input" id="pg-month" data-filter="payments.month" aria-label="Mês">' + opt('', 'Todos os meses', f.month) + months().map((m) => opt(m, U.monthLabel(m), f.month)).join('') + '</select>' +
      '<select class="input" id="pg-client" data-filter="payments.client" aria-label="Cliente">' + opt('', 'Todos os clientes', f.client) + S.state.clients.map((c) => opt(c.id, c.name, f.client)).join('') + '</select>' +
      '<select class="input" id="pg-status" data-filter="payments.status" aria-label="Status">' + opt('', 'Todos os status', f.status) + Object.keys(S.STATUS).map((k) => opt(k, S.STATUS[k], f.status)).join('') + '</select>' +
      '<select class="input" id="pg-method" data-filter="payments.method" aria-label="Forma de pagamento">' + opt('', 'PIX e boleto', f.method) + opt('pix', 'PIX', f.method) + opt('boleto', 'Boleto', f.method) + '</select>' +
      '<select class="input" id="pg-period" data-filter="payments.period" aria-label="Período de vencimento" data-rerender>' + PERIODS.map(([v, l]) => opt(v, l, f.period)).join('') + '</select>' +
      (f.period === 'range' ? '<input class="input" style="width:auto" type="date" id="pg-from" data-filter="payments.from" value="' + U.esc(f.from) + '" aria-label="De"><input class="input" style="width:auto" type="date" id="pg-to" data-filter="payments.to" value="' + U.esc(f.to) + '" aria-label="Até">' : '') +
      (f.q || f.client || f.status || f.method || f.period || f.month !== U.currentYm() ? '<button class="btn sm ghost" data-act="clear-payments">Limpar filtros</button>' : '') +
      '</div><div data-results>' + results(f) + '</div></div>' + history();
  }

  function renderResults(root, ui) { const el = root.querySelector('[data-results]'); if (el) el.innerHTML = results(ui.payments); }

  /* ---------- Modais ---------- */
  /** Registrar pagamento de uma mensalidade (id) ou de uma parcela de job (chave "j:..."). */
  function payModal(id) {
    const c = V.jobs.itemByKey(id);
    if (!c) return;
    I.modal({
      title: c.kind === 'job' ? 'Registrar pagamento da parcela' : 'Registrar pagamento',
      sub: U.esc(c.clientName) + ' · ' + U.esc(c.ref) + (c.dueDate ? ' · vencimento ' + U.dateBR(c.dueDate) : ''),
      body: '<div class="form-grid">' +
        '<div class="field"><label for="p-date">Data de recebimento</label><input class="input" type="date" id="p-date" value="' + U.today() + '" max="' + U.addDays(U.today(), 1) + '"></div>' +
        '<div class="field"><label for="p-amt">Valor recebido</label><input class="input tnum" id="p-amt" inputmode="decimal" value="' + U.esc(String(c.amount).replace('.', ',')) + '"></div></div>',
      foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>' + I.icon('check') + 'Confirmar pagamento</button>',
      onMount(el, close) {
        el.querySelector('[data-ok]').addEventListener('click', async () => {
          const date = el.querySelector('#p-date').value || U.today();
          const ok = await V.jobs.setItemStatus(id, 'pago', { paidAt: date, paidAmount: el.querySelector('#p-amt').value });
          if (ok) close();
        });
      },
    });
  }

  function editModal(id) {
    const c = S.state.charges.find((x) => x.id === id);
    if (!c) return;
    const client = S.clientById(c.clientId);
    I.modal({
      title: c.clientName + ' · ' + U.monthLabel(c.month),
      sub: (client ? U.esc(V.cal.dueRuleLabel(client)) + ' · ' : '') + (c.paymentMethod === 'pix' ? 'PIX' : 'Boleto') + ' · ' + V.store.STATUS[S.effStatus(c)],
      body: '<div class="form-grid">' +
        '<div class="field"><label for="e-amt">Valor desta mensalidade</label><input class="input tnum" id="e-amt" inputmode="decimal" value="' + U.esc(String(c.amount).replace('.', ',')) + '"></div>' +
        '<div class="field"><label for="e-due">Vencimento</label><input class="input" type="date" id="e-due" value="' + U.esc(c.dueDate) + '"></div>' +
        (c.status === 'pago' ? '<div class="field"><label for="e-paid">Recebido em</label><input class="input" type="date" id="e-paid" value="' + U.esc(c.paidAt || '') + '"></div>' +
          '<div class="field"><label for="e-pamt">Valor recebido</label><input class="input tnum" id="e-pamt" inputmode="decimal" value="' + U.esc(String(c.paidAmount != null ? c.paidAmount : c.amount).replace('.', ',')) + '"></div>' : '') +
        '<div class="field full"><label for="e-notes">Anotações deste mês</label><textarea class="input" id="e-notes" rows="3" placeholder="Ex.: pediu para pagar dia 12">' + U.esc(c.notes || '') + '</textarea></div>' +
        '<div class="full small muted">' + (c.sentAt ? 'Última cobrança enviada ' + U.timeAgo(c.sentAt) + (c.sentCount > 1 ? ' · ' + c.sentCount + ' envios' : '') + '. ' : 'Nenhuma cobrança enviada. ') + 'Alterações aqui valem só para este mês.</div></div>',
      foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>' + I.icon('check') + 'Salvar</button>',
      onMount(el, close) {
        el.querySelector('[data-ok]').addEventListener('click', async () => {
          const ok = await S.updateCharge(id, {
            amount: el.querySelector('#e-amt').value, dueDate: el.querySelector('#e-due').value, notes: el.querySelector('#e-notes').value,
            paidAt: el.querySelector('#e-paid') ? el.querySelector('#e-paid').value : null,
            paidAmount: el.querySelector('#e-pamt') ? el.querySelector('#e-pamt').value : null,
          });
          if (ok) close();
        });
      },
    });
  }

  V.views = V.views || {};
  V.views.pagamentos = { title: 'Pagamentos', render, renderResults, payModal, editModal };
})(window.Vulpes = window.Vulpes || {});
