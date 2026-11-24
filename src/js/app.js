/* Aplicação: estrutura da tela, navegação por endereço (#painel, #clientes...), filtros e ações. */
(function (V) {
  'use strict';
  const U = V.util, S = V.store, I = V.ui;

  const ROUTES = [
    ['painel', 'Painel', 'home'],
    ['cobrancas', 'Central de Cobranças', 'chat'],
    ['pagamentos', 'Mensalidades', 'receipt'],
    ['jobs', 'Jobs', 'briefcase'],
    ['despesas', 'Despesas', 'wallet'],
    ['calendario', 'Calendário', 'calendar'],
    ['clientes', 'Clientes', 'users'],
    ['ajustes', 'Configurações', 'settings'],
  ];

  const ui = {
    route: 'painel',
    month: U.currentYm(),
    clients: { q: '', method: '', status: '' },
    payments: { q: '', month: U.currentYm(), client: '', status: '', method: '', period: '', from: '', to: '' },
    billing: { q: '', kind: '' },
    cal: { method: '', kind: '' },
    jobs: { q: '', client: '', month: '', status: '' },
    desp: { tab: 'contas', q: '', type: '', status: '', category: '', payer: '' },
  };
  // Preferências de tela (filtros) lembradas neste navegador.
  try { const saved = JSON.parse(localStorage.getItem('vulpes-financeiro:ui') || 'null'); if (saved && saved.clients) { ui.clients = Object.assign(ui.clients, saved.clients); } } catch (e) { /* ignora */ }
  const remember = () => { try { localStorage.setItem('vulpes-financeiro:ui', JSON.stringify({ clients: ui.clients })); } catch (e) { /* ignora */ } };

  let root, viewEl, navEl, footEl;

  function shell() {
    root.innerHTML =
      '<div class="app">' +
      '<aside class="side"><div class="brand"><img class="brand-logo" src="' + V.brand.logo + '" alt="Vulpes agência"><img class="brand-emblem" src="' + V.brand.emblem + '" alt="Vulpes"><span class="brand-sub">Financeiro</span></div>' +
      '<nav class="nav" aria-label="Seções">' + ROUTES.map(([id, label, ic]) => '<a href="#' + id + '" data-route="' + id + '">' + I.icon(ic) + '<span class="lbl">' + label + '</span></a>').join('') + '</nav>' +
      '<div class="side-foot" data-foot></div></aside>' +
      '<main class="main"><div class="main-inner" id="view"><div class="loading">Carregando dados…</div></div></main></div>';
    viewEl = root.querySelector('#view');
    navEl = root.querySelector('.nav');
    footEl = root.querySelector('[data-foot]');
  }

  function updateNav() {
    const lateCount = S.state.ready ? V.views.cobrancas.lanes('').late.length : 0;
    navEl.querySelectorAll('a').forEach((a) => {
      const id = a.dataset.route;
      if (id === ui.route) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      const b = a.querySelector('.badge-count');
      if (id === 'cobrancas') {
        if (lateCount && !b) a.insertAdjacentHTML('beforeend', '<span class="badge-count">' + lateCount + '</span>');
        else if (b && lateCount) b.textContent = lateCount;
        else if (b) b.remove();
      }
    });
    const local = S.state.storageKind === 'local';
    const who = V.auth && V.auth.user;
    footEl.innerHTML = '<span><span class="dot' + (local ? ' local' : '') + '"></span>' + (local ? 'Salvo neste navegador' : 'Dados sincronizados') + '</span><span>' + U.esc(S.settings().agencyName) + '</span>' +
      (who ? '<span class="side-user">' + U.esc(who.nome) + ' · <button type="button" class="side-logout" data-act="logout">Sair</button></span>' : '');
  }

  function render(force) {
    const view = V.views[ui.route];
    if (!view) return;
    updateNav();
    document.title = 'Vulpes Financeiro';
    if (!S.state.ready) {
      viewEl.innerHTML = '<div class="loading">' + (S.state.slow ? 'Os dados estão demorando para carregar. Verifique sua conexão; a página atualiza sozinha quando eles chegarem.' : 'Carregando dados…') + '</div>';
      return;
    }
    if (view.noAutoRerender && !force && viewEl.dataset.view === ui.route) return;
    // Preserva foco e cursor (ex.: digitando na busca enquanto dados chegam).
    const ae = document.activeElement;
    const focusId = ae && ae.id && viewEl.contains(ae) ? ae.id : null;
    const sel = focusId && typeof ae.selectionStart === 'number' ? [ae.selectionStart, ae.selectionEnd] : null;
    const scroll = window.scrollY;
    let banner = '';
    if (S.state.storageKind === 'local' && window.claude) {
      banner = '<div class="banner">' + I.icon('alert') + '<span>Não foi possível conectar ao armazenamento da conta. As alterações estão sendo salvas só neste navegador.</span></div>';
    }
    if (S.state.error && S.state.error.code === 'revoked') banner = '<div class="banner">' + I.icon('alert') + '<span>O acesso aos dados foi encerrado nesta sessão. Recarregue a página.</span></div>';
    viewEl.dataset.view = ui.route;
    const tmp = document.createElement('div');
    view.render(tmp, ui);
    viewEl.innerHTML = banner;
    viewEl.append(...Array.from(tmp.childNodes));
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) { el.focus(); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignora */ } }
    }
    if (!force) window.scrollTo(0, scroll);
  }

  function go(route) {
    const r = ROUTES.some(([id]) => id === route) ? route : 'painel';
    if (r !== ui.route) { ui.route = r; render(true); window.scrollTo(0, 0); } else render(true);
  }
  function fromHash() { go((location.hash || '').replace('#', '')); }

  function setFilter(path, value) {
    const [grp, key] = path.split('.');
    ui[grp][key] = value;
    if (grp === 'clients') remember();
  }

  function rerenderResults() {
    const view = V.views[ui.route];
    if (view && view.renderResults) view.renderResults(viewEl, ui); else render();
  }

  function bind() {
    window.addEventListener('hashchange', fromHash);
    const debounced = U.debounce(rerenderResults, 120);
    document.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.filter && t.type === 'search') { setFilter(t.dataset.filter, t.value); debounced(); }
    });
    document.addEventListener('change', (e) => {
      const t = e.target;
      if (!t.dataset) return;
      if (t.dataset.filter && t.type !== 'search') {
        setFilter(t.dataset.filter, t.value);
        if (t.dataset.rerender !== undefined) render(); else rerenderResults();
        return;
      }
      if (t.dataset.act === 'status') {
        const id = t.dataset.id, val = t.value;
        const item = V.jobs.itemByKey(id);
        if (!item) return;
        if (val === 'pago') { t.value = S.effStatus(item); V.views.pagamentos.payModal(id); return; }
        V.jobs.setItemStatus(id, val);
        return;
      }
      if (t.dataset.act === 'exp-payer') {
        if (t.value) V.expenses.setEntryPayer(t.dataset.id, t.value);
        return;
      }
      if (t.dataset.act === 'exp-status') {
        const en = V.expenses.entryById(t.dataset.id);
        if (!en) return;
        if (t.value === 'pago') { t.value = V.expenses.effStatus(en); V.views.despesas.payModal(en.id); return; }
        V.expenses.setEntryStatus(en.id, t.value);
        return;
      }
      if (t.dataset.actChange === 'backup-import') V.views.ajustes.importBackup(t);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-act="job-open"]')) V.views.jobs.detail(e.target.dataset.id);
    });
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.tagName === 'SELECT') return;
      const id = el.dataset.id;
      switch (el.dataset.act) {
        case 'month-prev': ui.month = U.addMonths(ui.month, -1); render(); break;
        case 'month-next': ui.month = U.addMonths(ui.month, 1); render(); break;
        case 'month-today': ui.month = U.currentYm(); render(); break;
        case 'msg': V.views.cobrancas.messageModal(id); break;
        case 'pay': V.views.pagamentos.payModal(id); break;
        case 'edit-charge': V.views.pagamentos.editModal(id); break;
        case 'cal-ev': V.views.calendario.eventModal(id); break;
        case 'cal-method': ui.cal.method = el.dataset.val; render(); break;
        case 'cal-kind': ui.cal.kind = el.dataset.val; render(); break;
        case 'billing-kind': ui.billing.kind = el.dataset.val; render(); break;
        case 'job-new': V.views.jobs.openForm(null); break;
        case 'job-new-for': V.views.jobs.openForm(null, id); break;
        case 'job-open': V.views.jobs.detail(id); break;
        case 'inst-edit': V.views.jobs.instEditModal(id); break;
        case 'exp-new': V.views.despesas.openForm(null); break;
        case 'exp-new-var': V.views.despesas.entryForm(null, ui.month); break;
        case 'settle-open': V.views.despesas.settleModal(el.dataset.month); break;
        case 'exp-edit': V.views.despesas.openForm(V.expenses.expenseById(id)); break;
        case 'exp-del': V.views.despesas.confirmDelete(id); break;
        case 'exp-end': V.views.despesas.confirmEnd(id); break;
        case 'exp-pay': V.views.despesas.payModal(id); break;
        case 'exp-edit-entry': V.views.despesas.entryForm(id); break;
        case 'exp-del-entry': V.views.despesas.confirmDeleteEntry(id); break;
        case 'exp-tab': ui.desp.tab = el.dataset.val; render(); break;
        case 'exp-month': ui.month = el.dataset.month; render(); break;
        case 'client-new': V.views.clientes.openForm(null); break;
        case 'client-edit': V.views.clientes.openForm(S.clientById(id)); break;
        case 'client-del': V.views.clientes.confirmDelete(id); break;
        case 'pick-month': ui.payments.month = el.dataset.month; render(); window.scrollTo(0, 0); break;
        case 'clear-payments': Object.assign(ui.payments, { q: '', month: U.currentYm(), client: '', status: '', method: '', period: '', from: '', to: '' }); render(); break;
        case 'settings-save': V.views.ajustes.save(viewEl); break;
        case 'backup-export': V.views.ajustes.exportBackup(); break;
        case 'logout': if (V.auth) V.auth.signOut(); break;
        default: break;
      }
    });
  }

  async function start() {
    root = document.getElementById('app');
    if (V.auth && V.auth.enabled) await V.auth.gate(root);
    shell();
    bind();
    fromHash();
    S.onChange(() => render());
    await S.init();
    render(true);
  }

  V.app = { start, ui, render, go };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(window.Vulpes = window.Vulpes || {});
