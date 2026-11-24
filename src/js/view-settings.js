/* Configurações: dados da agência, chave PIX, regras de cobrança, modelos de mensagem, integrações e backup. */
(function (V) {
  'use strict';
  const U = V.util, S = V.store, I = V.ui, M = V.messaging, C = V.cal;

  const TEMPLATE_INFO = [
    ['pix', 'Lembrete para PIX', 'Usado para clientes PIX antes do vencimento.'],
    ['boleto', 'Lembrete para boleto', 'Usado para clientes de boleto antes do vencimento.'],
    ['atraso', 'Pagamento em atraso', 'Usado quando a mensalidade já venceu.'],
    ['job', 'Job: lembrete de parcela', 'Usado nas parcelas de jobs antes do vencimento. A linha PIX some em parcelas de boleto.'],
    ['job_atraso', 'Job: parcela em atraso', 'Usado quando a parcela de um job já venceu.'],
  ];

  function sampleCharge(kind) {
    const s = S.settings();
    const cl = S.state.clients.find((c) => (kind === 'boleto' ? c.paymentMethod === 'boleto' : c.paymentMethod === 'pix')) ||
      { name: 'Cliente', paymentMethod: kind === 'boleto' ? 'boleto' : 'pix', pixKey: s.pixKey, amount: 1400, dueRule: 'fixed', dueDay: 10 };
    const month = U.currentYm();
    if (kind === 'job' || kind === 'job_atraso') {
      return { client: cl, charge: { kind: 'job', clientName: cl.name, amount: 1000, paymentMethod: cl.paymentMethod, month, dueDate: U.addDays(U.today(), 3), title: 'Criação de identidade visual', parcela: 'segunda parcela', instLabel: 'Segunda etapa' } };
    }
    return { client: cl, charge: { clientName: cl.name, amount: cl.amount, paymentMethod: kind === 'atraso' ? cl.paymentMethod : (kind === 'boleto' ? 'boleto' : 'pix'), month, dueDate: C.dueDateFor(cl, month, s.bankDays) } };
  }

  function render(root) {
    const s = S.settings();
    const local = S.state.storageKind === 'local';
    const y = new Date().getFullYear();
    const hol = Array.from(C.holidays(y, s.bankDays).entries()).sort().map(([k, n]) => '<li><span class="tnum">' + U.dateBR(k) + '</span> · ' + U.esc(n) + '</li>').join('');

    root.innerHTML =
      '<div class="page-head"><div><div class="eyebrow">Ajustes</div><h1>Configurações</h1><p>Dados da agência, chave PIX, regras de vencimento e modelos de mensagem.</p></div>' +
      '<div class="row">' + (V.auth && V.auth.user ? '<button class="btn" type="button" data-act="logout">Sair (' + U.esc(V.auth.user.nome) + ')</button>' : '') +
      '<button class="btn primary" data-act="settings-save">' + I.icon('check') + 'Salvar configurações</button></div></div>' +
      '<form id="settings-form" novalidate style="display:grid;gap:18px">' +

      '<div class="grid-2b">' +
      '<div class="card"><div class="card-head"><div><h2>Agência</h2><p>Aparece nas mensagens e no sistema.</p></div></div><div class="card-pad form-grid">' +
      '<div class="field"><label for="s-name">Nome da agência</label><input class="input" id="s-name" name="agencyName" value="' + U.esc(s.agencyName) + '"></div>' +
      '<div class="field"><label for="s-short">Nome nas mensagens</label><input class="input" id="s-short" name="shortName" value="' + U.esc(s.shortName) + '"><span class="hint">Substitui {agencia}. Ex.: "mensalidade da Vulpes".</span></div>' +
      '<div class="field"><label for="s-cnpj">CNPJ</label><input class="input" id="s-cnpj" name="cnpj" value="' + U.esc(s.cnpj) + '"></div>' +
      '<div class="field"><label for="s-phone">Telefone da agência</label><input class="input" id="s-phone" name="agencyPhone" value="' + U.esc(s.agencyPhone) + '"></div>' +
      '<div class="field full"><label for="s-email">E-mail financeiro</label><input class="input" id="s-email" name="agencyEmail" type="email" value="' + U.esc(s.agencyEmail) + '"></div>' +
      '</div></div>' +

      '<div style="display:grid;gap:18px">' +
      '<div class="card"><div class="card-head"><div><h2>Chave PIX</h2><p>Preenchida automaticamente em todos os clientes PIX.</p></div></div><div class="card-pad" style="display:grid;gap:10px">' +
      '<div class="field"><label for="s-pix">Chave PIX da agência</label><input class="input mono" id="s-pix" name="pixKey" value="' + U.esc(s.pixKey) + '"></div>' +
      '<div class="hint small">Ao trocar a chave, os clientes PIX que usam a chave atual passam a usar a nova. Clientes de boleto não exibem chave.</div></div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Regras de cobrança</h2></div></div><div class="card-pad" style="display:grid;gap:12px">' +
      '<div class="field"><label for="s-soon">Considerar "próximo do vencimento" com antecedência de</label><div class="row"><input class="input tnum" style="width:90px" id="s-soon" name="soonDays" type="number" min="1" max="30" value="' + U.esc(s.soonDays) + '"><span class="muted">dias</span></div></div>' +
      '<label class="check"><input type="checkbox" id="s-bank" name="bankDays"' + (s.bankDays ? ' checked' : '') + '><span>Também tratar Carnaval e Corpus Christi como dias não úteis no cálculo do 5º dia útil. <span class="muted">Não são feriados nacionais por lei, mas os bancos não funcionam. Sábados, domingos e feriados nacionais já são sempre desconsiderados.</span></span></label>' +
      '</div></div></div></div>' +

      '<div class="card"><div class="card-head"><div><h2>Modelos de mensagem</h2><p>Clique numa variável para inseri-la no texto. A prévia usa dados reais de um cliente.</p></div>' +
      '<div class="placeholder-list">' + M.PLACEHOLDERS.map(([k, l]) => '<code data-ph="' + k + '" title="' + U.esc(l) + '">' + k + '</code>').join('') + '</div></div>' +
      '<div class="card-pad" style="display:grid;gap:22px">' +
      TEMPLATE_INFO.map(([k, title, hint]) => '<div class="grid-2b"><div class="field"><label for="t-' + k + '">' + title + '</label><textarea class="input" id="t-' + k + '" name="tpl_' + k + '" rows="8" data-tpl="' + k + '">' + U.esc(s.templates[k]) + '</textarea>' +
        '<div class="row"><span class="hint">' + hint + '</span><span class="spacer"></span><button type="button" class="btn sm ghost" data-reset-tpl="' + k + '">Restaurar padrão</button></div></div>' +
        '<div class="field"><span class="lbl-sm">Prévia</span><div class="preview-msg" data-preview="' + k + '"></div></div></div>').join('') +
      '</div></div>' +
      '</form>' +

      '<div class="grid-2b">' +
      '<div class="card"><div class="card-head"><div><h2>Integração com WhatsApp</h2><p>Como as mensagens saem do sistema.</p></div></div><div class="card-pad" style="display:grid;gap:12px">' +
      '<div class="list-item" style="padding:0;border:0"><span class="act-icon ok">' + I.icon('whatsapp') + '</span><div class="grow"><b>WhatsApp manual</b><div class="cell-sub">Ativo. Abre a conversa com o texto pronto; você envia e marca como enviada.</div></div><span class="pill s-pago">Ativo</span></div>' +
      '<div class="list-item" style="padding:0;border:0"><span class="act-icon">' + I.icon('plug') + '</span><div class="grow"><b>WhatsApp Business API</b><div class="cell-sub">Estrutura pronta para integração futura. Mesmo integrada, cada envio exigirá confirmação manual.</div></div><span class="pill">Não configurada</span></div>' +
      '</div></div>' +
      '<div class="card"><div class="card-head"><div><h2>Dados e backup</h2><p>' + (local ? 'Os dados estão salvos <b>neste navegador</b>.' : 'Os dados ficam salvos com segurança na sua conta e aparecem em qualquer dispositivo onde você abrir o sistema.') + '</p></div></div><div class="card-pad" style="display:grid;gap:12px">' +
      '<div class="row"><button class="btn" data-act="backup-export">' + I.icon('download') + 'Exportar backup</button>' +
      '<label class="btn" for="backup-file">' + I.icon('upload') + 'Importar backup</label><input type="file" id="backup-file" accept="application/json,.json" class="sr-only" data-act-change="backup-import"></div>' +
      '<div class="hint small">' + S.state.clients.length + ' clientes · ' + S.state.charges.length + ' mensalidades · ' + S.state.jobs.length + ' jobs · ' + S.state.expenses.length + ' despesas cadastradas · ' + S.state.expenseEntries.length + ' lançamentos de despesas · ' + S.state.activity.length + ' atividades.</div>' +
      '<details><summary class="small" style="cursor:pointer">Feriados considerados em ' + y + '</summary><ul class="small muted" style="margin:8px 0 0;padding-left:18px;columns:2">' + hol + '</ul></details>' +
      '</div></div></div>';

    const form = root.querySelector('#settings-form');
    const preview = () => {
      const cur = Object.assign({}, S.settings(), { shortName: form.shortName.value, pixKey: form.pixKey.value });
      TEMPLATE_INFO.forEach(([k]) => {
        cur.templates = Object.assign({}, cur.templates, { [k]: form['tpl_' + k].value });
        const smp = sampleCharge(k);
        const cl = Object.assign({}, smp.client, { pixKey: smp.client.paymentMethod === 'pix' ? cur.pixKey : '' });
        if (smp.charge.kind === 'job') smp.charge.paymentMethod = 'pix';
        root.querySelector('[data-preview="' + k + '"]').textContent = M.build(smp.charge, cl, cur, k);
      });
    };
    let lastTa = null;
    form.addEventListener('focusin', (e) => { if (e.target.dataset && e.target.dataset.tpl) lastTa = e.target; });
    form.addEventListener('input', preview);
    root.querySelectorAll('[data-ph]').forEach((b) => b.addEventListener('click', () => {
      const ta = lastTa || form.tpl_pix;
      const a = ta.selectionStart, z = ta.selectionEnd;
      ta.value = ta.value.slice(0, a) + b.dataset.ph + ta.value.slice(z);
      ta.focus(); ta.selectionStart = ta.selectionEnd = a + b.dataset.ph.length;
      preview();
    }));
    root.querySelectorAll('[data-reset-tpl]').forEach((b) => b.addEventListener('click', () => {
      form['tpl_' + b.dataset.resetTpl].value = M.DEFAULT_TEMPLATES[b.dataset.resetTpl]; preview();
    }));
    preview();
  }

  async function save(root) {
    const form = root.querySelector('#settings-form');
    if (!form) return;
    const pix = form.pixKey.value.trim();
    if (!pix) { I.toast('Informe a chave PIX da agência.', true); form.pixKey.focus(); return; }
    await S.saveSettings({
      agencyName: form.agencyName.value.trim() || 'Agência Vulpes', shortName: form.shortName.value.trim() || 'Vulpes',
      cnpj: form.cnpj.value.trim(), agencyPhone: form.agencyPhone.value.trim(), agencyEmail: form.agencyEmail.value.trim(),
      pixKey: pix, soonDays: Math.min(30, Math.max(1, Number(form.soonDays.value) || 5)), bankDays: form.bankDays.checked,
      templates: { pix: form.tpl_pix.value, boleto: form.tpl_boleto.value, atraso: form.tpl_atraso.value, job: form.tpl_job.value, job_atraso: form.tpl_job_atraso.value },
    });
  }

  async function exportBackup() {
    const data = JSON.stringify(S.exportBackup(), null, 2);
    const filename = 'vulpes-financeiro-backup-' + U.today() + '.json';
    let dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
    if (dl) {
      try { await dl.save({ filename, data }); return; } catch (e) { /* recusado: mostra o texto */ }
    } else if (!window.claude) {
      try {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        return;
      } catch (e) { /* segue */ }
    }
    I.modal({
      title: 'Backup dos dados', sub: 'Copie o conteúdo e salve num arquivo .json.',
      body: '<textarea class="input mono" id="bk-text" rows="14" readonly>' + U.esc(data) + '</textarea>',
      foot: '<button class="btn" data-close>Fechar</button><button class="btn primary" data-copy>' + I.icon('copy') + 'Copiar</button>',
      onMount(el) { el.querySelector('[data-copy]').addEventListener('click', async () => { const ok = await I.copyText(data, el.querySelector('#bk-text')); I.toast(ok ? 'Backup copiado.' : 'Texto selecionado: use Ctrl+C.'); }); },
    });
  }

  function importBackup(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let data;
      try { data = JSON.parse(reader.result); } catch (e) { I.toast('Arquivo inválido: não é um backup do Vulpes Financeiro.', true); return; }
      if (!data || !Array.isArray(data.clients) || !Array.isArray(data.charges)) { I.toast('Arquivo inválido: não é um backup do Vulpes Financeiro.', true); return; }
      const ok = await I.confirmDialog({
        title: 'Importar backup?', ok: 'Importar',
        text: 'Serão gravados ' + data.clients.length + ' clientes e ' + data.charges.length + ' mensalidades. Registros com o mesmo identificador serão substituídos pelos do arquivo; os demais permanecem.',
      });
      if (!ok) return;
      try { await S.importBackup(data); I.toast('Backup importado.'); } catch (e) { I.toast('Não foi possível importar o backup.', true); }
    };
    reader.readAsText(file);
  }

  V.views = V.views || {};
  V.views.ajustes = { title: 'Configurações', render, save, exportBackup, importBackup, noAutoRerender: true };
})(window.Vulpes = window.Vulpes || {});
