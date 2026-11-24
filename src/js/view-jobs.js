/* JOBS: serviços adicionais com parcelas próprias (separados das mensalidades). */
(function (V) {
  'use strict';
  const U = V.util, S = V.store, I = V.ui, J = V.jobs;

  const STATUS_FILTERS = [['', 'Todos os status'], ['pago', 'Pagos'], ['parcial', 'Parcialmente pagos'], ['pendente', 'Pendentes'], ['atraso', 'Em atraso'], ['andamento', 'Em andamento (não quitados)']];

  function jobPill(st) { return '<span class="pill j-' + st + '">' + U.esc(J.JOB_STATUS[st]) + '</span>'; }
  function nextLabel(sm) {
    if (!sm.next) return '<span class="muted">Quitado</span>';
    const n = sm.next;
    if (!n.dueDate) return '<div>' + U.esc(n.condition || 'A combinar') + '</div><div class="cell-sub">' + U.money(n.amount) + ' · sem data</div>';
    const late = S.isOverdue(n);
    return '<div class="tnum"' + (late ? ' style="color:var(--bad);font-weight:600"' : '') + '>' + U.dateBR(n.dueDate) + '</div><div class="cell-sub">' + U.money(n.amount) + ' · ' + U.relDays(n.dueDate) + '</div>';
  }

  function filtered(f) {
    const q = U.norm(f.q);
    const t = U.today();
    return S.state.jobs.filter((j) => {
      if (q && !U.norm(j.title).includes(q) && !U.norm(j.clientName).includes(q)) return false;
      if (f.client && j.clientId !== f.client) return false;
      if (f.month && (j.contractDate || '').slice(0, 7) !== f.month) return false;
      if (f.status) {
        const st = J.summary(j, t).status;
        if (f.status === 'andamento' ? st === 'pago' : st !== f.status) return false;
      }
      return true;
    });
  }

  function results(f) {
    const list = filtered(f);
    if (!S.state.jobs.length) {
      return '<div class="empty" style="padding:48px 20px">' + I.icon('briefcase') + '<div><b style="color:var(--ink)">Nenhum job cadastrado ainda.</b></div>' +
        '<div>Cadastre serviços extras, como identidade visual, sessões de foto ou campanhas, com parcelas próprias. Eles ficam separados das mensalidades.</div>' +
        '<button class="btn primary cta" data-act="job-new">' + I.icon('plus') + 'Novo job</button></div>';
    }
    if (!list.length) return I.empty('Nenhum job encontrado com esses filtros.', 'briefcase');
    const t = U.today();
    const rows = list.map((j) => {
      const sm = J.summary(j, t);
      return '<tr class="clickable" data-act="job-open" data-id="' + U.esc(j.id) + '" tabindex="0">' +
        '<td><div class="cell-name">' + U.esc(j.clientName) + '</div><div class="cell-sub">Contratado em ' + U.dateBR(j.contractDate) + '</div></td>' +
        '<td><div class="cell-name">' + U.esc(j.title) + '</div><div class="cell-sub">' + sm.paidCount + ' de ' + sm.count + ' parcelas pagas</div></td>' +
        '<td class="r"><b>' + U.money(sm.total) + '</b></td>' +
        '<td class="r" style="color:var(--ok)">' + U.money(sm.received) + '<div class="bar"><i style="width:' + sm.pct + '%"></i></div></td>' +
        '<td class="r">' + U.money(sm.pending) + '</td>' +
        '<td>' + nextLabel(sm) + '</td>' +
        '<td>' + jobPill(sm.status) + '</td></tr>';
    }).join('');
    return '<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Serviço</th><th class="r">Valor total</th><th class="r">Recebido</th><th class="r">Pendente</th><th>Próximo pagamento</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function render(root, ui) {
    const f = ui.jobs;
    const t = U.today();
    const all = S.state.jobs.map((j) => J.summary(j, t));
    const sum = (k) => all.reduce((a, s) => a + s[k], 0);
    const months = Array.from(new Set(S.state.jobs.map((j) => (j.contractDate || '').slice(0, 7)).filter(Boolean))).sort().reverse();
    const opt = (v, l, cur) => '<option value="' + U.esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + U.esc(l) + '</option>';
    const kpi = (cls, label, value, sub) => '<div class="card kpi ' + cls + '"><div class="k-label">' + label + '</div><div class="k-value">' + value + '</div><div class="k-sub">' + sub + '</div></div>';
    root.innerHTML =
      '<div class="page-head"><div><div class="eyebrow">Serviços adicionais</div><h1>Jobs</h1><p>Trabalhos extras com parcelas próprias, separados das mensalidades. Só entra como recebido o que foi marcado como pago.</p></div>' +
      '<button class="btn primary cta" data-act="job-new">' + I.icon('plus') + 'Novo job</button></div>' +
      '<div class="kpis kpis-4">' +
      kpi('dark', 'Total contratado', U.money(sum('total')), S.state.jobs.length + (S.state.jobs.length === 1 ? ' job' : ' jobs')) +
      kpi('ok', 'Recebido', U.money(sum('received')), (sum('total') ? Math.round((sum('received') / sum('total')) * 100) : 0) + '% do contratado') +
      kpi('warn', 'Pendente', U.money(sum('pending')), all.filter((s) => s.status !== 'pago').length + ' em andamento') +
      kpi(all.some((s) => s.status === 'atraso') ? 'bad' : '', 'Em atraso', String(all.filter((s) => s.status === 'atraso').length), 'jobs com parcela vencida') +
      '</div>' +
      '<div class="card"><div class="toolbar">' +
      '<div class="search">' + I.icon('search') + '<input class="input" id="jb-q" type="search" placeholder="Buscar por cliente ou serviço" value="' + U.esc(f.q) + '" data-filter="jobs.q"></div>' +
      '<select class="input" id="jb-client" data-filter="jobs.client" aria-label="Cliente">' + opt('', 'Todos os clientes', f.client) + S.state.clients.map((c) => opt(c.id, c.name, f.client)).join('') + '</select>' +
      '<select class="input" id="jb-month" data-filter="jobs.month" aria-label="Mês de contratação">' + opt('', 'Qualquer mês de contratação', f.month) + months.map((m) => opt(m, 'Contratado em ' + U.monthLabel(m), f.month)).join('') + '</select>' +
      '<select class="input" id="jb-status" data-filter="jobs.status" aria-label="Status">' + STATUS_FILTERS.map(([v, l]) => opt(v, l, f.status)).join('') + '</select>' +
      '</div><div data-results>' + results(f) + '</div></div>';
  }
  function renderResults(root, ui) { const el = root.querySelector('[data-results]'); if (el) el.innerHTML = results(ui.jobs); }

  /* ---------- Formulário (novo / editar) ---------- */
  function openForm(job, presetClientId) {
    const s = S.settings();
    const isNew = !job;
    const today = U.today();
    const model = {
      clientId: job ? job.clientId : (presetClientId || ''), title: job ? job.title : '', description: job ? job.description : '',
      total: job ? job.total : 0, contractDate: job ? job.contractDate : today, paymentMethod: job ? job.paymentMethod : 'pix', notes: job ? job.notes : '',
      installments: job ? JSON.parse(JSON.stringify(job.installments || [])) : J.defaultInstallments(0, today, 'pix'),
    };
    const lockedCount = (model.installments || []).filter((i) => i.status === 'pago').length;
    const clientOpts = '<option value="">Selecione o cliente…</option>' + S.state.clients.map((c) => '<option value="' + U.esc(c.id) + '"' + (c.id === model.clientId ? ' selected' : '') + '>' + U.esc(c.name) + (c.hasRetainer === false ? ' (só jobs)' : '') + '</option>').join('') + '<option value="__new">+ Adicionar novo cliente</option>';

    const body =
      '<form id="job-form" class="form-grid" novalidate>' +
      '<div class="field"><label for="j-client">Cliente</label><select class="input" id="j-client" name="clientId">' + clientOpts + '</select></div>' +
      '<div class="field"><label for="j-title">Nome do serviço</label><input class="input" id="j-title" name="title" value="' + U.esc(model.title) + '" placeholder="Ex.: Criação de identidade visual"></div>' +
      '<div class="full form-grid new-client" hidden style="background:var(--surface-2);border:1px solid var(--line);border-radius:8px;padding:12px">' +
      '<div class="field"><label for="j-nc-name">Nome do novo cliente</label><input class="input" id="j-nc-name"></div>' +
      '<div class="field"><label for="j-nc-contact">Nome para a mensagem</label><input class="input" id="j-nc-contact" placeholder="Quem faz o pagamento"></div>' +
      '<div class="field"><label for="j-nc-phone">WhatsApp</label><input class="input" id="j-nc-phone" inputmode="tel" placeholder="(15) 99999-9999"></div>' +
      '<div class="field"><span class="hint" style="padding-top:22px">O cliente é cadastrado como "só jobs", sem mensalidade. Dá para incluir mensalidade depois, em Clientes.</span></div></div>' +
      '<div class="field full"><label for="j-desc">Descrição</label><textarea class="input" id="j-desc" name="description" rows="2" placeholder="O que foi contratado">' + U.esc(model.description) + '</textarea></div>' +
      '<div class="field"><label for="j-total">Valor total cobrado</label><input class="input tnum" id="j-total" name="total" inputmode="decimal" value="' + (model.total ? U.esc(String(model.total).replace('.', ',')) : '') + '" placeholder="2.000,00"></div>' +
      '<div class="field"><label for="j-date">Data de contratação / aceite</label><input class="input" type="date" id="j-date" name="contractDate" value="' + U.esc(model.contractDate) + '"></div>' +
      '<div class="field"><span class="lbl-sm">Forma de pagamento</span><div class="seg" role="group" aria-label="Forma de pagamento">' +
      '<button type="button" data-jm="pix" aria-pressed="' + (model.paymentMethod === 'pix') + '">PIX</button><button type="button" data-jm="boleto" aria-pressed="' + (model.paymentMethod === 'boleto') + '">Boleto</button></div>' +
      '<span class="hint">Aplica a todas as parcelas; cada parcela pode ser ajustada abaixo.</span></div>' +
      '<div class="field"><label for="j-notes">Observações</label><input class="input" id="j-notes" name="notes" value="' + U.esc(model.notes) + '"></div>' +
      '<div class="full" style="display:grid;gap:10px"><div class="row"><h3>Condições de pagamento</h3><span class="spacer"></span>' +
      '<button type="button" class="btn sm" data-inst="add">' + I.icon('plus') + 'Parcela</button>' +
      '<button type="button" class="btn sm ghost" data-inst="equal">Dividir igualmente</button>' +
      '<button type="button" class="btn sm ghost" data-inst="default">Padrão 50/50</button></div>' +
      (lockedCount ? '<div class="notice warn">' + I.icon('alert') + '<span>Parcelas já pagas mantêm o registro de recebimento. Evite mudar o valor delas.</span></div>' : '') +
      '<div class="table-wrap inst-wrap"><table class="inst-table"><thead><tr><th>#</th><th>Etapa</th><th>Condição</th><th class="r">%</th><th class="r">Valor</th><th>Vencimento</th><th>Forma</th><th></th></tr></thead><tbody data-inst-body></tbody></table></div>' +
      '<div class="inst-total" data-inst-total></div></div>' +
      '</form>';

    I.modal({
      wide: 'x', title: isNew ? 'Novo job' : 'Editar job', sub: 'Valores das parcelas são calculados pelo percentual, e vice-versa.',
      body,
      foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-save>' + I.icon('check') + (isNew ? 'Cadastrar job' : 'Salvar alterações') + '</button>',
      onMount(el, close) {
        const form = el.querySelector('#job-form');
        const tbody = el.querySelector('[data-inst-body]');
        const totalEl = el.querySelector('[data-inst-total]');
        const total = () => U.parseMoney(form.total.value);
        const fixRemainder = () => {
          const t = total(), list = model.installments;
          const pctSum = J.round2(list.reduce((a, i) => a + (Number(i.percent) || 0), 0));
          if (list.length && Math.abs(pctSum - 100) < 0.001) {
            const others = list.slice(0, -1).reduce((a, i) => a + (Number(i.amount) || 0), 0);
            list[list.length - 1].amount = J.round2(t - others);
          }
        };
        const recalcFromPercent = () => { const t = total(); model.installments.forEach((i) => { i.amount = J.round2(t * (Number(i.percent) || 0) / 100); }); fixRemainder(); };
        const drawTotal = () => {
          const t = total();
          const sAmt = J.round2(model.installments.reduce((a, i) => a + (Number(i.amount) || 0), 0));
          const sPct = J.round2(model.installments.reduce((a, i) => a + (Number(i.percent) || 0), 0));
          const diff = J.round2(t - sAmt);
          totalEl.innerHTML = '<span>Total das parcelas: <b class="tnum">' + U.money(sAmt) + '</b> (' + String(sPct).replace('.', ',') + '%)</span>' +
            (t && Math.abs(diff) >= 0.01 ? '<span class="warn-text">' + (diff > 0 ? 'Faltam ' : 'Sobram ') + U.money(Math.abs(diff)) + ' para fechar ' + U.money(t) + '</span><button type="button" class="btn sm" data-inst="fix">Ajustar última parcela</button>'
              : (t ? '<span class="ok-text">' + I.icon('check') + 'Fecha com o valor total</span>' : ''));
        };
        const draw = () => {
          tbody.innerHTML = model.installments.map((i, idx) => {
            const paid = i.status === 'pago';
            return '<tr data-row="' + idx + '"><td class="muted tnum">' + (idx + 1) + '</td>' +
              '<td><input class="input" data-f="label" value="' + U.esc(i.label) + '" aria-label="Nome da etapa ' + (idx + 1) + '"></td>' +
              '<td><input class="input" data-f="condition" value="' + U.esc(i.condition || '') + '" placeholder="Ex.: Na entrega" aria-label="Condição ' + (idx + 1) + '"></td>' +
              '<td class="r"><input class="input tnum" style="width:72px;text-align:right" data-f="percent" inputmode="decimal" value="' + U.esc(String(J.round2(i.percent)).replace('.', ',')) + '" aria-label="Percentual ' + (idx + 1) + '"></td>' +
              '<td class="r"><input class="input tnum" style="width:118px;text-align:right" data-f="amount" inputmode="decimal" value="' + U.esc(String(J.round2(i.amount).toFixed(2)).replace('.', ',')) + '" aria-label="Valor ' + (idx + 1) + '"></td>' +
              '<td><input class="input" type="date" data-f="dueDate" value="' + U.esc(i.dueDate || '') + '" aria-label="Vencimento ' + (idx + 1) + '"></td>' +
              '<td><select class="input" data-f="paymentMethod" aria-label="Forma ' + (idx + 1) + '"><option value="pix"' + (i.paymentMethod !== 'boleto' ? ' selected' : '') + '>PIX</option><option value="boleto"' + (i.paymentMethod === 'boleto' ? ' selected' : '') + '>Boleto</option></select></td>' +
              '<td>' + (paid ? '<span class="pill s-pago no-dot" title="Paga">Paga</span>' : (model.installments.length > 1 ? '<button type="button" class="btn sm icon ghost danger" data-del="' + idx + '" aria-label="Remover parcela">' + I.icon('trash') + '</button>' : '')) + '</td></tr>';
          }).join('');
          drawTotal();
        };
        const syncRow = (idx) => {
          const tr = tbody.querySelector('[data-row="' + idx + '"]');
          if (!tr) return;
          const i = model.installments[idx];
          const pctEl = tr.querySelector('[data-f="percent"]'), amtEl = tr.querySelector('[data-f="amount"]');
          if (document.activeElement !== pctEl) pctEl.value = String(J.round2(i.percent)).replace('.', ',');
          if (document.activeElement !== amtEl) amtEl.value = J.round2(i.amount).toFixed(2).replace('.', ',');
        };
        tbody.addEventListener('input', (e) => {
          const tr = e.target.closest('[data-row]'); if (!tr) return;
          const idx = Number(tr.dataset.row), f = e.target.dataset.f, i = model.installments[idx];
          if (f === 'percent') {
            i.percent = U.parseMoney(e.target.value); i.amount = J.round2(total() * i.percent / 100); fixRemainder();
            model.installments.forEach((_, k) => syncRow(k));
          } else if (f === 'amount') {
            i.amount = U.parseMoney(e.target.value); i.percent = total() ? J.round2((i.amount / total()) * 100) : 0; syncRow(idx);
          } else i[f] = e.target.value;
          drawTotal();
        });
        tbody.addEventListener('change', (e) => { const tr = e.target.closest('[data-row]'); if (tr && e.target.tagName === 'SELECT') model.installments[Number(tr.dataset.row)].paymentMethod = e.target.value; });
        tbody.addEventListener('click', (e) => {
          const b = e.target.closest('[data-del]'); if (!b) return;
          model.installments.splice(Number(b.dataset.del), 1); draw();
        });
        form.total.addEventListener('input', () => { recalcFromPercent(); model.installments.forEach((_, k) => syncRow(k)); drawTotal(); });
        form.contractDate.addEventListener('change', () => { const first = model.installments[0]; if (first && first.status !== 'pago' && (!first.dueDate || isNew)) { first.dueDate = form.contractDate.value; draw(); } });
        el.querySelectorAll('[data-jm]').forEach((b) => b.addEventListener('click', () => {
          model.paymentMethod = b.dataset.jm;
          el.querySelectorAll('[data-jm]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          model.installments.forEach((i) => { if (i.status !== 'pago') i.paymentMethod = model.paymentMethod; });
          draw();
        }));
        el.querySelectorAll('[data-inst]').forEach((b) => b.addEventListener('click', () => act(b.dataset.inst)));
        totalEl.addEventListener('click', (e) => { const b = e.target.closest('[data-inst]'); if (b) act(b.dataset.inst); });
        function act(a) {
          const t = total(), list = model.installments;
          if (a === 'add') {
            list.push({ id: '', label: 'Etapa ' + (list.length + 1), condition: '', percent: 0, amount: 0, dueDate: '', paymentMethod: model.paymentMethod });
          } else if (a === 'equal') {
            const n = list.length, p = J.round2(100 / n);
            list.forEach((i, k) => { i.percent = k === n - 1 ? J.round2(100 - p * (n - 1)) : p; });
            recalcFromPercent();
          } else if (a === 'default') {
            const keepIds = list.map((i) => i.id);
            model.installments = J.defaultInstallments(t, form.contractDate.value, model.paymentMethod).map((i, k) => Object.assign(i, { id: keepIds[k] || i.id, status: (list[k] && list[k].status) || undefined }));
          } else if (a === 'fix') {
            const others = list.slice(0, -1).reduce((x, i) => x + (Number(i.amount) || 0), 0);
            const last = list[list.length - 1];
            last.amount = J.round2(t - others); last.percent = t ? J.round2((last.amount / t) * 100) : 0;
          }
          draw();
        }
        const sel = form.clientId;
        const syncClient = () => { el.querySelector('.new-client').hidden = sel.value !== '__new'; if (sel.value === '__new') setTimeout(() => el.querySelector('#j-nc-name').focus(), 20); };
        sel.addEventListener('change', syncClient);
        draw();

        el.querySelector('[data-save]').addEventListener('click', async () => {
          const t = total();
          let clientId = sel.value;
          if (!clientId) { I.toast('Selecione o cliente.', true); sel.focus(); return; }
          if (!form.title.value.trim()) { I.toast('Informe o nome do serviço.', true); form.title.focus(); return; }
          if (!(t > 0)) { I.toast('Informe o valor total do job.', true); form.total.focus(); return; }
          if (!model.installments.length) { I.toast('Inclua pelo menos uma parcela.', true); return; }
          const sAmt = J.round2(model.installments.reduce((a, i) => a + (Number(i.amount) || 0), 0));
          if (Math.abs(sAmt - t) >= 0.01) { I.toast('A soma das parcelas (' + U.money(sAmt) + ') precisa fechar com o valor total (' + U.money(t) + ').', true); return; }
          const btn = el.querySelector('[data-save]'); btn.disabled = true;
          if (clientId === '__new') {
            const name = el.querySelector('#j-nc-name').value.trim();
            if (!name) { btn.disabled = false; I.toast('Informe o nome do novo cliente.', true); el.querySelector('#j-nc-name').focus(); return; }
            clientId = await S.saveClient({ name, contactName: el.querySelector('#j-nc-contact').value, phone: el.querySelector('#j-nc-phone').value, amount: 0, dueRule: 'fixed', dueDay: 10, paymentMethod: model.paymentMethod, status: 'ativo', hasRetainer: false, notes: '', silent: true });
            if (!clientId) { btn.disabled = false; return; }
          }
          const client = S.clientById(clientId);
          const id = await J.saveJob({
            id: job && job.id, clientId, clientName: client ? client.name : el.querySelector('#j-nc-name').value.trim(),
            title: form.title.value, description: form.description.value, total: t, contractDate: form.contractDate.value || today,
            paymentMethod: model.paymentMethod, notes: form.notes.value, installments: model.installments,
          });
          btn.disabled = false;
          if (id) { close(); if (isNew) setTimeout(() => detail(id), 60); }
        });
      },
    });
  }

  /* ---------- Detalhes do job ---------- */
  function detail(id) {
    let unsub = null;
    const body = () => {
      const j = J.jobById(id);
      if (!j) return '<div class="empty">Este job foi excluído.</div>';
      const t = U.today();
      const sm = J.summary(j, t);
      const items = (j.installments || []).map((i, idx) => J.fromInst(j, i, idx));
      const rows = items.map((it) => {
        const st = S.effStatus(it, t);
        return '<tr><td><div class="cell-name">' + (it.instIndex + 1) + '. ' + U.esc(it.instLabel) + '</div><div class="cell-sub">' + U.esc(it.condition || '') + '</div></td>' +
          '<td class="r"><b>' + U.money(it.amount) + '</b><div class="cell-sub">' + String(J.round2(it.raw.percent)).replace('.', ',') + '%</div></td>' +
          '<td>' + (it.dueDate ? '<div class="tnum">' + U.dateBR(it.dueDate) + '</div><div class="cell-sub">' + (it.status !== 'pago' ? U.relDays(it.dueDate) : U.esc(U.weekday(it.dueDate))) + '</div>' : '<span class="muted">Sem data</span>') + '</td>' +
          '<td>' + I.methodTag(it.paymentMethod) + '</td>' +
          '<td>' + I.statusSelect(Object.assign({}, it, { id: it.key })) + (it.sentAt ? '<div class="cell-sub" style="margin-top:4px">Cobrado ' + U.timeAgo(it.sentAt) + '</div>' : '') + '</td>' +
          '<td>' + (it.status === 'pago' ? '<div class="tnum">' + U.dateBR(it.paidAt) + '</div>' + (it.paidAmount != null && it.paidAmount !== it.amount ? '<div class="cell-sub">' + U.money(it.paidAmount) + '</div>' : '') : '<span class="muted">—</span>') + '</td>' +
          '<td><div class="actions">' + (it.status !== 'pago' ? '<button class="btn sm" data-act="pay" data-id="' + U.esc(it.key) + '">' + I.icon('check') + 'Pago</button><button class="btn sm primary" data-act="msg" data-id="' + U.esc(it.key) + '" title="Gerar mensagem de cobrança">' + I.icon('chat') + '</button>' : '<button class="btn sm" data-act="inst-edit" data-id="' + U.esc(it.key) + '" title="Corrigir recebimento">' + I.icon('edit') + '</button>') + '</div></td></tr>';
      }).join('');
      const hist = S.state.activity.filter((a) => a.jobId === id).slice(0, 12);
      const histHtml = hist.length ? hist.map((a) => '<div class="list-item" style="padding:9px 0"><span class="act-icon ' + (a.type === 'payment' ? 'ok' : a.type === 'sent' ? 'info' : '') + '">' + I.icon(a.type === 'payment' ? 'cash' : a.type === 'sent' ? 'send' : 'briefcase') + '</span><div class="grow"><div>' + U.esc(a.text) + '</div><div class="cell-sub">' + U.timeAgo(a.at) + (a.amount ? ' · ' + U.money(a.amount) : '') + '</div></div></div>').join('') : '<div class="muted small">Sem movimentações ainda.</div>';
      const stat = (label, value, color) => '<div class="mini-stat"><span>' + label + '</span><b' + (color ? ' style="color:' + color + '"' : '') + '>' + value + '</b></div>';
      return '<div class="row" style="justify-content:space-between"><div class="row">' + jobPill(sm.status) + I.methodTag(j.paymentMethod) + '<span class="muted small">Contratado em ' + U.dateBR(j.contractDate) + '</span></div></div>' +
        '<div class="mini-stats">' + stat('Valor total', U.money(sm.total)) + stat('Recebido', U.money(sm.received), 'var(--ok)') + stat('Pendente', U.money(sm.pending), sm.pending ? 'var(--warn)' : '') + stat('Recebido (%)', sm.pct + '%') +
        stat('Próximo vencimento', sm.next ? (sm.next.dueDate ? U.dateBR(sm.next.dueDate) : U.esc(sm.next.condition || 'A combinar')) : 'Quitado', sm.next && S.isOverdue(sm.next) ? 'var(--bad)' : '') + '</div>' +
        '<div class="progress"><i style="width:' + sm.pct + '%"></i></div>' +
        (j.description ? '<div><div class="lbl-sm">Descrição</div><div style="white-space:pre-wrap">' + U.esc(j.description) + '</div></div>' : '') +
        (j.notes ? '<div class="small"><b>Observações:</b> ' + U.esc(j.notes) + '</div>' : '') +
        '<div><h3 style="margin-bottom:8px">Parcelas</h3><div class="table-wrap" style="border:1px solid var(--line);border-radius:8px"><table><thead><tr><th>Etapa</th><th class="r">Valor</th><th>Vencimento</th><th>Forma</th><th>Status</th><th>Recebido em</th><th class="r">Ações</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
        '<div><h3 style="margin-bottom:4px">Histórico de pagamentos e cobranças</h3>' + histHtml + '</div>';
    };
    const j0 = J.jobById(id);
    if (!j0) return;
    I.modal({
      wide: 'x', title: j0.title, sub: U.esc(j0.clientName),
      body: '<div data-detail style="display:grid;gap:16px">' + body() + '</div>',
      foot: '<button class="btn danger" data-del>' + I.icon('trash') + 'Excluir job</button><span class="spacer"></span><button class="btn" data-close>Fechar</button><button class="btn primary" data-edit>' + I.icon('edit') + 'Editar job</button>',
      onMount(el, close) {
        const box = el.querySelector('[data-detail]');
        unsub = S.onChange(() => { if (!box.contains(document.activeElement) || document.activeElement.tagName !== 'SELECT') box.innerHTML = body(); });
        el.querySelector('[data-edit]').addEventListener('click', () => { close(); openForm(J.jobById(id)); });
        el.querySelector('[data-del]').addEventListener('click', async () => {
          const j = J.jobById(id);
          const paid = (j.installments || []).filter((i) => i.status === 'pago').length;
          const ok = await I.confirmDialog({ title: 'Excluir este job?', danger: true, ok: 'Excluir job', text: 'O job <b>' + U.esc(j.title) + '</b> e suas parcelas serão removidos.' + (paid ? ' Ele tem ' + paid + ' parcela(s) paga(s), que deixarão de aparecer no faturamento.' : '') });
          if (ok) { await J.deleteJob(id); close(); }
        });
      },
      onClose() { if (unsub) unsub(); },
    });
  }

  function instEditModal(key) {
    const it = J.itemByKey(key);
    if (!it) return;
    I.modal({
      title: 'Corrigir recebimento', sub: U.esc(it.clientName) + ' · ' + U.esc(it.ref),
      body: '<div class="form-grid"><div class="field"><label for="ie-date">Recebido em</label><input class="input" type="date" id="ie-date" value="' + U.esc(it.paidAt || '') + '"></div>' +
        '<div class="field"><label for="ie-amt">Valor recebido</label><input class="input tnum" id="ie-amt" inputmode="decimal" value="' + U.esc(String(it.paidAmount != null ? it.paidAmount : it.amount).replace('.', ',')) + '"></div></div>' +
        '<div class="hint small">Para desfazer o pagamento, mude o status da parcela para "Aguardando pagamento".</div>',
      foot: '<button class="btn" data-close>Cancelar</button><button class="btn primary" data-ok>' + I.icon('check') + 'Salvar</button>',
      onMount(el, close) {
        el.querySelector('[data-ok]').addEventListener('click', async () => {
          if (await J.updateInstallment(it.jobId, it.instId, { paidAt: el.querySelector('#ie-date').value, paidAmount: el.querySelector('#ie-amt').value })) close();
        });
      },
    });
  }

  V.views = V.views || {};
  V.views.jobs = { title: 'Jobs', render, renderResults, openForm, detail, instEditModal, jobPill };
})(window.Vulpes = window.Vulpes || {});
