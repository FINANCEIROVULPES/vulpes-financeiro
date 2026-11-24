/* Central de Cobranças: separa quem está em atraso, quem vence em breve, quem está pendente e quem já
 * foi cobrado. A mensagem é gerada, editada, copiada e aberta no WhatsApp; marcar como enviada é sempre manual. */
(function (V) {
  'use strict';
  const U = V.util, S = V.store, I = V.ui, M = V.messaging;

  function lanes(q, kind) {
    const t = U.today();
    const s = S.settings();
    const soonLimit = U.addDays(t, Number(s.soonDays) || 5);
    const endOfMonth = U.currentYm() + '-31';
    const nq = U.norm(q);
    const open = V.jobs.allItems().filter((c) => c.status !== 'pago' && (!kind || c.kind === kind) &&
      (!nq || U.norm(c.clientName).includes(nq) || U.norm(c.title).includes(nq)));
    const byDue = (a, b) => ((a.dueDate || '9999') < (b.dueDate || '9999') ? -1 : (a.dueDate || '9999') > (b.dueDate || '9999') ? 1 : 0);
    const late = open.filter((c) => S.needsLateFollowUp(c, t)).sort(byDue);
    const lateIds = new Set(late.map((c) => c.id));
    const sent = open.filter((c) => c.status === 'enviada' && !lateIds.has(c.id)).sort(byDue);
    const rest = open.filter((c) => !lateIds.has(c.id) && c.status !== 'enviada' && (!c.dueDate || c.dueDate >= t));
    const soon = rest.filter((c) => c.dueDate && c.dueDate <= soonLimit).sort(byDue);
    const pending = rest.filter((c) => !c.dueDate || (c.dueDate > soonLimit && c.dueDate <= endOfMonth)).sort(byDue);
    return { late, soon, pending, sent, soonDays: Number(s.soonDays) || 5 };
  }

  function card(c, kind) {
    const t = U.today();
    const overdue = S.isOverdue(c, t);
    const days = c.dueDate ? U.daysBetween(c.dueDate, t) : 0;
    const meta = !c.dueDate ? '<span>Sem data · ' + U.esc(c.condition || 'a combinar') + '</span>'
      : overdue ? '<span style="color:var(--bad);font-weight:600">Venceu ' + U.dateBR(c.dueDate) + ' · ' + days + (days === 1 ? ' dia' : ' dias') + ' de atraso</span>'
      : '<span>Vence ' + U.dateBR(c.dueDate) + ' · ' + U.relDays(c.dueDate) + '</span>';
    return '<div class="bill">' +
      '<div class="bill-top"><div><div class="bill-name">' + U.esc(c.clientName) + '</div><div class="cell-sub">' + (c.kind === 'job' ? '<span class="kind-tag">Job</span> ' : '<span class="kind-tag rec">Mensalidade</span> ') + U.esc(c.kind === 'job' ? c.ref : U.monthLabel(c.month)) + '</div></div><div class="bill-amt">' + U.money(c.amount) + '</div></div>' +
      '<div class="bill-meta">' + I.methodTag(c.paymentMethod) + meta + '</div>' +
      (c.sentAt ? '<div class="bill-meta">' + I.icon('send', '') .replace('<svg ', '<svg style="width:13px;height:13px" ') + 'Cobrança enviada ' + U.timeAgo(c.sentAt) + (/atraso/.test(c.sentKind || '') ? ' (atraso)' : '') + (c.sentCount > 1 ? ' · ' + c.sentCount + 'x' : '') + '</div>' : '') +
      '<div class="bill-actions">' +
      '<button class="btn cta ' + (kind === 'sent' ? '' : 'primary') + '" data-act="msg" data-id="' + U.esc(c.id) + '">' + I.icon('chat') + (kind === 'sent' ? 'Gerar nova mensagem' : 'Gerar mensagem de cobrança') + '</button>' +
      '<button class="btn sm" data-act="pay" data-id="' + U.esc(c.id) + '" title="Registrar pagamento">' + I.icon('check') + 'Pago</button>' +
      '</div></div>';
  }

  function lane(key, title, color, list, hint) {
    return '<div class="card"><div class="lane-head"><span class="dot" style="background:' + color + '"></span><h3>' + title + '</h3><span class="count">' + list.length + ' · ' + U.money(list.reduce((a, c) => a + c.amount, 0)) + '</span></div>' +
      (list.length ? list.map((c) => card(c, key)).join('') : '<div class="empty small">' + U.esc(hint) + '</div>') + '</div>';
  }

  function results(ui) {
    const L = lanes(ui.billing.q, ui.billing.kind);
    return '<div class="lanes">' +
      lane('late', 'Em atraso', 'var(--bad)', L.late, 'Ninguém em atraso.') +
      lane('soon', 'Vencem em até ' + L.soonDays + ' dias', 'var(--warn)', L.soon, 'Nenhum vencimento nos próximos dias.') +
      lane('pending', 'Pendentes no mês', 'var(--accent)', L.pending, 'Sem outras mensalidades pendentes neste mês.') +
      lane('sent', 'Cobrança enviada', 'var(--info)', L.sent, 'As cobranças marcadas como enviadas aparecem aqui até o pagamento.') +
      '</div>';
  }

  function render(root, ui) {
    const L = lanes('', ui.billing.kind);
    root.innerHTML =
      '<div class="page-head"><div><div class="eyebrow">Cobranças pelo WhatsApp</div><h1>Central de Cobranças</h1>' +
      '<p>' + (L.late.length ? '<b style="color:var(--bad)">' + L.late.length + ' em atraso</b> · ' : '') + L.soon.length + ' vencem em breve · ' + L.sent.length + ' aguardando retorno. Nada é enviado sem você confirmar.</p></div>' +
      '<div class="row"><div class="seg" role="group" aria-label="Tipo de cobrança">' +
      [['', 'Tudo'], ['mensalidade', 'Mensalidades'], ['job', 'Jobs']].map(([v, l]) => '<button type="button" data-act="billing-kind" data-val="' + v + '" aria-pressed="' + ((ui.billing.kind || '') === v) + '">' + l + '</button>').join('') + '</div>' +
      '<div class="search" style="width:min(280px,100%)">' + I.icon('search') + '<input class="input" id="bl-q" type="search" placeholder="Buscar cliente ou job" value="' + U.esc(ui.billing.q) + '" data-filter="billing.q"></div></div></div>' +
      '<div data-results>' + results(ui) + '</div>';
  }
  function renderResults(root, ui) { const el = root.querySelector('[data-results]'); if (el) el.innerHTML = results(ui); }

  /* ---------- Janela da mensagem ---------- */
  function messageModal(id) {
    const c = V.jobs.itemByKey(id);
    if (!c) return;
    const client = S.clientById(c.clientId);
    const s = S.settings();
    const overdue = S.isOverdue(c);
    let kind = M.templateKind(c, overdue);
    let opened = false, copied = false;
    const phone0 = (client && client.phone) || '';
    const kinds = c.kind === 'job' ? [['job', 'Lembrete de parcela'], ['job_atraso', 'Parcela em atraso']]
      : [['pix', 'Lembrete PIX'], ['boleto', 'Lembrete boleto'], ['atraso', 'Pagamento em atraso']]
        .filter(([k]) => k === 'atraso' || k === c.paymentMethod || (k === 'boleto' && c.paymentMethod !== 'pix'));

    I.modal({
      wide: true,
      title: c.kind === 'job' ? 'Cobrança de job' : 'Cobrança de mensalidade',
      sub: U.esc(c.clientName) + ' · ' + (c.kind === 'job' ? U.esc(c.ref) + ' · ' : '') + U.money(c.amount) + ' · ' + (c.dueDate ? 'vencimento ' + U.dateBR(c.dueDate) : 'sem data') + ' · ' + (c.paymentMethod === 'pix' ? 'PIX' : 'Boleto'),
      body:
        '<div class="steps"><div class="step" data-step="1"><b>1</b>Revise o texto</div><div class="step" data-step="2"><b>2</b>Copie ou abra o WhatsApp</div><div class="step" data-step="3"><b>3</b>Marque como enviada</div></div>' +
        '<div class="row" style="justify-content:space-between"><div class="seg" role="group" aria-label="Modelo">' +
        kinds.map(([k, l]) => '<button type="button" data-kind="' + k + '" aria-pressed="' + (k === kind) + '">' + l + '</button>').join('') + '</div>' +
        (overdue ? '<span class="pill s-atraso">Vencida</span>' : '') + '</div>' +
        '<div class="field"><label for="m-text">Mensagem (pode editar à vontade)</label><textarea class="input msg-box" id="m-text"></textarea></div>' +
        '<div class="form-grid"><div class="field"><label for="m-phone">WhatsApp do cliente</label><input class="input" id="m-phone" inputmode="tel" value="' + U.esc(U.formatPhone(phone0)) + '" placeholder="(11) 98888-7777">' +
        '<span class="hint" id="m-phone-hint">' + (phone0 ? 'Número do cadastro.' : 'Sem número no cadastro: informe aqui ou escolha o contato no WhatsApp.') + '</span></div>' +
        (client && !phone0 ? '<div class="field" style="align-content:end"><label class="check"><input type="checkbox" id="m-save-phone" checked><span>Salvar este número no cadastro de ' + U.esc(client.name) + '</span></label></div>' : '<div></div>') + '</div>' +
        '<div class="notice">' + I.icon('info') + '<span>Abrir o WhatsApp não envia nada: a conversa abre com o texto pronto e você decide enviar. Depois, volte aqui e marque como enviada.</span></div>',
      foot:
        '<button class="btn" data-close>Fechar</button><span class="spacer"></span>' +
        '<button class="btn" data-copy>' + I.icon('copy') + 'Copiar texto</button>' +
        '<a class="btn wa" data-wa href="#" target="_blank" rel="noopener noreferrer">' + I.icon('whatsapp') + 'Abrir no WhatsApp</a>' +
        '<button class="btn primary" data-sent disabled title="Disponível depois de copiar ou abrir o WhatsApp">' + I.icon('send') + 'Marcar como enviada</button>',
      onMount(el, close) {
        const ta = el.querySelector('#m-text');
        const phone = el.querySelector('#m-phone');
        const wa = el.querySelector('[data-wa]');
        const sentBtn = el.querySelector('[data-sent]');
        let edited = false;
        const fillText = () => { ta.value = M.build(c, client, s, kind); edited = false; updateLink(); };
        const updateLink = () => { wa.href = M.channels.manual.link(phone.value, ta.value); };
        const step = (n) => el.querySelector('[data-step="' + n + '"]').classList.add('done');
        const unlock = () => { sentBtn.disabled = false; sentBtn.title = ''; step(1); step(2); };
        fillText();
        ta.addEventListener('input', () => { edited = true; updateLink(); });
        phone.addEventListener('input', updateLink);
        el.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => {
          if (b.dataset.kind === kind) return;
          kind = b.dataset.kind;
          el.querySelectorAll('[data-kind]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          if (edited) I.toast('O texto foi trocado pelo novo modelo.');
          fillText();
        }));
        const maybeSavePhone = () => {
          const box = el.querySelector('#m-save-phone');
          if (box && box.checked && U.digits(phone.value).length >= 10 && client) {
            box.checked = false;
            S.saveClient(Object.assign({}, client, { phone: phone.value }));
          }
        };
        el.querySelector('[data-copy]').addEventListener('click', async () => {
          const ok = await I.copyText(ta.value, ta);
          I.toast(ok ? 'Mensagem copiada.' : 'Texto selecionado: use Ctrl+C para copiar.', !ok);
          copied = true; unlock();
        });
        wa.addEventListener('click', () => {
          updateLink();
          if (!U.digits(phone.value)) I.toast('Sem número: escolha o contato no WhatsApp.');
          opened = true; unlock(); maybeSavePhone();
        });
        sentBtn.addEventListener('click', async () => {
          if (!opened && !copied) return;
          sentBtn.disabled = true;
          const ok = await V.jobs.setItemStatus(c.key, 'enviada', { sentKind: kind });
          if (ok) { step(3); close(); } else sentBtn.disabled = false;
        });
      },
    });
  }

  V.views = V.views || {};
  V.views.cobrancas = { title: 'Central de Cobranças', render, renderResults, messageModal, lanes };
})(window.Vulpes = window.Vulpes || {});
