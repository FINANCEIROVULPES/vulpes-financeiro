/* Componentes de interface: ícones, pílulas de status, modal, avisos e helpers de formulário. */
(function (V) {
  'use strict';
  const U = V.util;

  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.8c2 .6 3.2 2.3 3.5 5.2"/>',
    receipt: '<path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    whatsapp: '<path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.2 3.1z"/><path d="M9 8.5c0 3.5 2.6 6.5 6.5 6.5l1-1.6-2-1-1 .9c-1-.4-2.4-1.8-2.8-2.8l.9-1-1-2z"/>',
    send: '<path d="M21 3 10 14"/><path d="M21 3 14 21l-4-7-7-4z"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.2v.1"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7V6a2 2 0 0 1 2-2h11"/><circle cx="16.5" cy="13.5" r="1.2"/>',
    trend: '<path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.8v.1"/>',
    left: '<path d="m15 5-7 7 7 7"/>',
    right: '<path d="m9 5 7 7-7 7"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    plug: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v4"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12.5h18M11 12.5v1.5h2v-1.5"/>',
    cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>',
  };
  function icon(name, cls) {
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
  }

  const BRAND_MARK =
    '<svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="10" fill="#6b3fdc"/>' +
    '<path d="M9 11 L16.5 18.5 L23.5 18.5 L31 11 L28.5 24 L20 31 L11.5 24 Z" fill="#fff"/>' +
    '<path d="M16.5 18.5 L20 24.5 L23.5 18.5 Z" fill="#16131d"/></svg>';

  function statusPill(st) {
    return '<span class="pill s-' + st + '">' + U.esc(V.store.STATUS[st] || st) + '</span>';
  }
  function methodTag(m) {
    return m === 'pix' ? '<span class="tag pix">PIX</span>' : '<span class="tag">Boleto</span>';
  }
  function statusSelect(ch) {
    const eff = V.store.effStatus(ch);
    const opts = Object.keys(V.store.STATUS).map((k) => '<option value="' + k + '"' + (k === eff ? ' selected' : '') + '>' + V.store.STATUS[k] + '</option>').join('');
    return '<select class="status-select s-' + eff + '" data-act="status" data-id="' + U.esc(ch.id) + '" aria-label="Status de ' + U.esc(ch.clientName) + '">' + opts + '</select>';
  }
  function dateBox(dateStr) {
    const t = U.today();
    const d = U.parseYmd(dateStr);
    const cls = dateStr === t ? ' today' : dateStr < t ? ' late' : '';
    return '<div class="datebox' + cls + '"><b>' + U.pad(d.getDate()) + '</b><span>' + U.MONTHS_SHORT[d.getMonth()] + '</span></div>';
  }
  function empty(text, ic) { return '<div class="empty">' + icon(ic || 'info') + '<div>' + U.esc(text) + '</div></div>'; }

  /* ---------- Toast ---------- */
  function toast(msg, isErr) {
    let box = document.querySelector('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), isErr ? 6000 : 3200);
  }

  /* ---------- Modal ---------- */
  let modalStack = [];
  function modal(opts) {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML =
      '<div class="modal' + (opts.wide ? ' wide' : '') + (opts.wide === 'x' ? ' xwide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<div class="modal-head"><div><h2 id="modal-title">' + U.esc(opts.title) + '</h2>' + (opts.sub ? '<p>' + opts.sub + '</p>' : '') + '</div>' +
      '<button class="btn icon ghost" data-close aria-label="Fechar">' + icon('x') + '</button></div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.foot ? '<div class="modal-foot">' + opts.foot + '</div>' : '') + '</div>';
    const prevFocus = document.activeElement;
    const close = () => {
      back.remove();
      modalStack = modalStack.filter((m) => m !== close);
      document.removeEventListener('keydown', onKey);
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* ignora */ }
      opts.onClose && opts.onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape' && modalStack[modalStack.length - 1] === close) close(); };
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    back.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    modalStack.push(close);
    const el = back.querySelector('.modal');
    opts.onMount && opts.onMount(el, close);
    const f = el.querySelector('[autofocus]') || el.querySelector('.modal-body input, .modal-body textarea, .modal-body select');
    if (f) setTimeout(() => f.focus(), 30);
    return close;
  }

  function confirmDialog(opts) {
    return new Promise((resolve) => {
      let answered = false;
      modal({
        title: opts.title, sub: opts.sub,
        body: '<p style="margin:0">' + opts.text + '</p>' + (opts.extra || ''),
        foot: '<button class="btn" data-close>Cancelar</button><button class="btn ' + (opts.danger ? 'danger solid' : 'primary') + '" data-ok>' + U.esc(opts.ok || 'Confirmar') + '</button>',
        onMount(el, close) {
          el.querySelector('[data-ok]').addEventListener('click', () => { answered = true; const extra = opts.read ? opts.read(el) : true; close(); resolve(extra); });
        },
        onClose() { if (!answered) resolve(false); },
      });
    });
  }

  /* Copiar para a área de transferência, com plano B (selecionar o texto). */
  async function copyText(text, fallbackEl) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      if (fallbackEl && fallbackEl.select) { fallbackEl.focus(); fallbackEl.select(); try { if (document.execCommand('copy')) return true; } catch (err) { /* ignora */ } }
      return false;
    }
  }

  function formData(form) {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = v; });
    return o;
  }

  V.ui = { icon, BRAND_MARK, statusPill, methodTag, statusSelect, dateBox, empty, toast, modal, confirmDialog, copyText, formData };
})(window.Vulpes = window.Vulpes || {});
