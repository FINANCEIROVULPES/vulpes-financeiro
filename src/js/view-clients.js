/* Clientes: tabela com busca e filtros, cadastro, edição e exclusão. */
(function (V) {
  'use strict';
  const U = V.util, S = V.store, I = V.ui, C = V.cal;

  function filtered(f) {
    const q = U.norm(f.q);
    return S.state.clients.filter((c) =>
      (!q || U.norm(c.name).includes(q) || U.norm(c.contactName).includes(q)) &&
      (!f.method || c.paymentMethod === f.method) &&
      (!f.status || c.status === f.status));
  }

  function rows(f) {
    const list = filtered(f);
    if (!list.length) return '<tr><td colspan="7">' + I.empty(S.state.clients.length ? 'Nenhum cliente encontrado com esses filtros.' : 'Nenhum cliente cadastrado ainda. Use "Novo cliente" para começar.', 'users') + '</td></tr>';
    const s = S.settings();
    const cur = U.currentYm();
    return list.map((c) => {
      const due = C.dueDateFor(c, cur, s.bankDays);
      const curCharge = S.state.charges.find((x) => x.clientId === c.id && x.month === cur);
      return '<tr>' +
        '<td><div class="cell-name">' + U.esc(c.name) + '</div><div class="cell-sub">' + (c.contactName ? U.esc(c.contactName) + ' · ' : '') + (c.phone ? U.esc(U.formatPhone(c.phone)) : 'sem WhatsApp') + '</div></td>' +
        (c.hasRetainer === false ? '<td class="r"><span class="muted">Só jobs</span></td><td><span class="muted">—</span></td>' :
        '<td class="r"><b>' + U.money(c.amount) + '</b></td>' +
        '<td><div>' + U.esc(C.dueRuleLabel(c)) + '</div><div class="cell-sub">' + U.dateBR(due) + ' neste mês</div></td>') +
        '<td>' + I.methodTag(c.paymentMethod) + (c.paymentMethod === 'pix' ? '<div class="cell-sub mono" style="margin-top:3px">' + U.esc(c.pixKey || s.pixKey) + '</div>' : '') + '</td>' +
        '<td>' + (c.status === 'ativo' ? '<span class="pill s-ativo">Ativo</span>' : '<span class="pill s-inativo">Inativo</span>') +
        (curCharge ? '<div style="margin-top:5px">' + I.statusPill(S.effStatus(curCharge)) + '</div>' : '') + '</td>' +
        '<td class="cell-sub" style="max-width:220px;overflow-wrap:anywhere">' + U.esc(c.notes || '') + '</td>' +
        '<td><div class="actions">' +
        (curCharge && curCharge.status !== 'pago' ? '<button class="btn sm" data-act="msg" data-id="' + U.esc(curCharge.id) + '" title="Gerar mensagem de cobrança">' + I.icon('chat') + '</button>' : '') +
        '<button class="btn sm" data-act="job-new-for" data-id="' + U.esc(c.id) + '" title="Novo job para este cliente">' + I.icon('briefcase') + '</button>' +
        '<button class="btn sm" data-act="client-edit" data-id="' + U.esc(c.id) + '" title="Editar">' + I.icon('edit') + '</button>' +
        '<button class="btn sm danger" data-act="client-del" data-id="' + U.esc(c.id) + '" title="Excluir">' + I.icon('trash') + '</button>' +
        '</div></td></tr>';
    }).join('');
  }

  function render(root, ui) {
    const f = ui.clients;
    const act = S.retainerClients();
    root.innerHTML =
      '<div class="page-head"><div><div class="eyebrow">Cadastro</div><h1>Clientes</h1>' +
      '<p>' + act.length + ' com mensalidade ativa · ' + U.money(act.reduce((a, c) => a + (Number(c.amount) || 0), 0)) + ' em contratos mensais</p></div>' +
      '<button class="btn primary" data-act="client-new">' + I.icon('plus') + 'Novo cliente</button></div>' +
      '<div class="card">' +
      '<div class="toolbar">' +
      '<div class="search">' + I.icon('search') + '<input class="input" id="cl-q" type="search" placeholder="Buscar cliente pelo nome" value="' + U.esc(f.q) + '" data-filter="clients.q"></div>' +
      '<select class="input" id="cl-method" data-filter="clients.method" aria-label="Forma de pagamento"><option value="">Todas as formas</option><option value="pix"' + (f.method === 'pix' ? ' selected' : '') + '>PIX</option><option value="boleto"' + (f.method === 'boleto' ? ' selected' : '') + '>Boleto</option></select>' +
      '<select class="input" id="cl-status" data-filter="clients.status" aria-label="Status"><option value="">Todos os status</option><option value="ativo"' + (f.status === 'ativo' ? ' selected' : '') + '>Ativos</option><option value="inativo"' + (f.status === 'inativo' ? ' selected' : '') + '>Inativos</option></select>' +
      '</div>' +
      '<div class="table-wrap"><table><thead><tr><th>Cliente</th><th class="r">Mensalidade</th><th>Vencimento</th><th>Pagamento</th><th>Status</th><th>Observações</th><th class="r">Ações</th></tr></thead>' +
      '<tbody data-results>' + rows(f) + '</tbody></table></div></div>';
  }

  function renderResults(root, ui) { const tb = root.querySelector('[data-results]'); if (tb) tb.innerHTML = rows(ui.clients); }

  /* ---------- Formulário ---------- */
  function openForm(client) {
    const s = S.settings();
    const c = Object.assign({ name: '', contactName: '', amount: '', dueRule: 'fixed', dueDay: 10, paymentMethod: 'pix', pixKey: s.pixKey, phone: '', status: 'ativo', notes: '', startMonth: U.currentYm() }, client || {});
    const isNew = !client;
    const body =
      '<form id="client-form" class="form-grid" novalidate>' +
      '<div class="field"><label for="f-name">Nome do cliente</label><input class="input" id="f-name" name="name" required value="' + U.esc(c.name) + '" autofocus></div>' +
      '<div class="field"><label for="f-contact">Nome para a mensagem</label><input class="input" id="f-contact" name="contactName" value="' + U.esc(c.contactName) + '" placeholder="Ex.: Ana (opcional)"><span class="hint">Usado no "Oi, ...!". Se vazio, usa o nome do cliente.</span></div>' +
      '<div class="field full"><label class="check"><input type="checkbox" id="f-ret" name="hasRetainer" value="true"' + (c.hasRetainer !== false ? ' checked' : '') + '><span><b>Cliente com mensalidade</b> <span class="muted">· desmarque para clientes que só contratam jobs</span></span></label></div>' +
      '<div class="field" data-ret><label for="f-amount">Valor mensal do contrato</label><input class="input tnum" id="f-amount" name="amount" inputmode="decimal" required value="' + (c.amount !== '' ? U.esc(String(c.amount).replace('.', ',')) : '') + '" placeholder="1.400,00"></div>' +
      '<div class="field"><label for="f-phone">Telefone / WhatsApp</label><input class="input" id="f-phone" name="phone" inputmode="tel" value="' + U.esc(c.phone) + '" placeholder="(11) 98888-7777"></div>' +
      '<div class="field" data-ret><span class="lbl-sm">Regra de vencimento</span><div class="seg" role="group" aria-label="Regra de vencimento">' +
      '<button type="button" data-seg="dueRule" data-val="fixed" aria-pressed="' + (c.dueRule !== 'bd5') + '">Dia fixo</button>' +
      '<button type="button" data-seg="dueRule" data-val="bd5" aria-pressed="' + (c.dueRule === 'bd5') + '">5º dia útil</button></div>' +
      '<input type="hidden" name="dueRule" value="' + (c.dueRule === 'bd5' ? 'bd5' : 'fixed') + '"></div>' +
      '<div class="field" data-show="fixed"><label for="f-day">Dia de vencimento</label><input class="input tnum" id="f-day" name="dueDay" type="number" min="1" max="31" value="' + U.esc(c.dueDay) + '"><span class="hint">Em meses mais curtos, vence no último dia do mês.</span></div>' +
      '<div class="field" data-show="bd5"><span class="lbl-sm">Dia de vencimento</span><div class="hint" style="padding-top:6px">Calculado a cada mês, sem sábados, domingos e feriados nacionais. Em ' + U.esc(U.monthLabel(U.currentYm(), { noYear: true })) + ': <b>' + U.dateBR(C.nthBusinessDay(U.ymParts(U.currentYm()).y, U.ymParts(U.currentYm()).m, 5, s.bankDays)) + '</b>.</div></div>' +
      '<div class="field"><span class="lbl-sm">Forma de pagamento</span><div class="seg" role="group" aria-label="Forma de pagamento">' +
      '<button type="button" data-seg="paymentMethod" data-val="pix" aria-pressed="' + (c.paymentMethod === 'pix') + '">PIX</button>' +
      '<button type="button" data-seg="paymentMethod" data-val="boleto" aria-pressed="' + (c.paymentMethod !== 'pix') + '">Boleto</button></div>' +
      '<input type="hidden" name="paymentMethod" value="' + (c.paymentMethod === 'pix' ? 'pix' : 'boleto') + '"></div>' +
      '<div class="field" data-show="pix"><label for="f-pix">Chave PIX</label><input class="input mono" id="f-pix" name="pixKey" value="' + U.esc(c.pixKey || s.pixKey) + '"><span class="hint">Preenchida com a chave da agência.</span></div>' +
      '<div class="field"><label for="f-status">Status</label><select class="input" id="f-status" name="status"><option value="ativo"' + (c.status === 'ativo' ? ' selected' : '') + '>Ativo</option><option value="inativo"' + (c.status === 'inativo' ? ' selected' : '') + '>Inativo</option></select></div>' +
      '<div class="field" data-ret><label for="f-start">Início da cobrança</label><input class="input" id="f-start" name="startMonth" type="month" value="' + U.esc(c.startMonth || U.currentYm()) + '"><span class="hint">Primeiro mês com mensalidade gerada.</span></div>' +
      '<div class="field full"><label for="f-notes">Observações</label><textarea class="input" id="f-notes" name="notes" rows="3">' + U.esc(c.notes) + '</textarea></div>' +
      '</form>';
    I.modal({
      title: isNew ? 'Novo cliente' : 'Editar ' + c.name,
      sub: isNew ? 'As mensalidades são geradas automaticamente a partir do mês de início.' : 'Mudanças de valor e vencimento valem para as mensalidades em aberto a partir deste mês. O histórico fica como está.',
      body,
      foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-save>' + I.icon('check') + (isNew ? 'Cadastrar cliente' : 'Salvar alterações') + '</button>',
      onMount(el, close) {
        const form = el.querySelector('#client-form');
        const sync = () => {
          const rule = form.dueRule.value, pm = form.paymentMethod.value;
          el.querySelector('[data-show="fixed"]').hidden = rule !== 'fixed';
          el.querySelector('[data-show="bd5"]').hidden = rule !== 'bd5';
          el.querySelector('[data-show="pix"]').hidden = pm !== 'pix';
          const ret = form.hasRetainer.checked;
          el.querySelectorAll('[data-ret]').forEach((x) => { x.hidden = !ret; });
          if (!ret) { el.querySelector('[data-show="fixed"]').hidden = true; el.querySelector('[data-show="bd5"]').hidden = true; }
          if (pm === 'pix' && !form.pixKey.value) form.pixKey.value = s.pixKey;
        };
        el.querySelectorAll('[data-seg]').forEach((b) => b.addEventListener('click', () => {
          const k = b.dataset.seg;
          form[k].value = b.dataset.val;
          el.querySelectorAll('[data-seg="' + k + '"]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          sync();
        }));
        form.hasRetainer.addEventListener('change', sync);
        sync();
        const submit = async () => {
          const d = I.formData(form);
          if (!d.name.trim()) { I.toast('Informe o nome do cliente.', true); form.name.focus(); return; }
          d.hasRetainer = form.hasRetainer.checked;
          if (d.hasRetainer && !(U.parseMoney(d.amount) > 0)) { I.toast('Informe o valor mensal.', true); form.amount.focus(); return; }
          if (d.dueRule === 'fixed' && !(Number(d.dueDay) >= 1 && Number(d.dueDay) <= 31)) { I.toast('O dia de vencimento deve ser de 1 a 31.', true); form.dueDay.focus(); return; }
          d.id = client && client.id;
          const btn = el.querySelector('[data-save]'); btn.disabled = true;
          const id = await S.saveClient(d);
          btn.disabled = false;
          if (id) close();
        };
        el.querySelector('[data-save]').addEventListener('click', submit);
        form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
      },
    });
  }

  async function confirmDelete(id) {
    const c = S.clientById(id);
    if (!c) return;
    const n = S.state.charges.filter((x) => x.clientId === id).length;
    const res = await I.confirmDialog({
      title: 'Excluir ' + c.name + '?', danger: true, ok: 'Excluir cliente',
      text: 'O cadastro será removido. Se o cliente só pausou o contrato, prefira marcar como <b>inativo</b>.',
      extra: n ? '<label class="check"><input type="checkbox" id="keep-hist" checked><span>Manter o histórico de ' + n + ' mensalidade(s) nos relatórios. Mensalidades futuras em aberto são removidas.</span></label>' : '',
      read: (el) => ({ keep: el.querySelector('#keep-hist') ? el.querySelector('#keep-hist').checked : true }),
    });
    if (res) S.deleteClient(id, res.keep);
  }

  V.views = V.views || {};
  V.views.clientes = { title: 'Clientes', render, renderResults, openForm, confirmDelete };
})(window.Vulpes = window.Vulpes || {});
