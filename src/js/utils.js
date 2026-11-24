/* Utilitários: formatação, datas (sempre em horário local, strings AAAA-MM-DD) e escape de HTML. */
(function (V) {
  'use strict';

  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** "R$ 1.400,00" com espaço comum (o Intl usa espaço não separável). */
  function money(n) { return brl.format(Number(n) || 0).replace(/ /g, ' '); }
  function moneyShort(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 1000) return 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
    return 'R$ ' + Math.round(n);
  }
  /** Aceita "1.400,00", "1400", "1400.5" e devolve número. */
  function parseMoney(s) {
    if (typeof s === 'number') return s;
    s = String(s || '').replace(/[^\d,.-]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  const pad = (n) => String(n).padStart(2, '0');
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); }
  function today() { return ymd(new Date()); }
  function ym(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function currentYm() { return ym(new Date()); }
  function ymParts(s) { const [y, m] = String(s).split('-').map(Number); return { y, m }; }
  function addMonths(s, n) { const { y, m } = ymParts(s); return ym(new Date(y, m - 1 + n, 1)); }
  function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function daysBetween(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
  function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
  function monthLabel(s, opts) {
    const { y, m } = ymParts(s);
    const name = MONTHS[m - 1];
    if (opts && opts.noYear) return name;
    return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + y;
  }
  function dateBR(s) { if (!s) return '—'; const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; }
  function dateShort(s) { if (!s) return '—'; const d = parseYmd(s); return pad(d.getDate()) + ' ' + MONTHS_SHORT[d.getMonth()]; }
  function weekday(s) { return WEEKDAYS[parseYmd(s).getDay()]; }
  function relDays(s, ref) {
    const n = daysBetween(ref || today(), s);
    if (n === 0) return 'hoje';
    if (n === 1) return 'amanhã';
    if (n === -1) return 'ontem';
    if (n > 1) return 'em ' + n + ' dias';
    return 'há ' + (-n) + ' dias';
  }
  function timeAgo(iso) {
    const t = new Date(iso).getTime();
    if (!t) return '';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return 'há ' + Math.round(s / 60) + ' min';
    if (s < 86400) return 'há ' + Math.round(s / 3600) + ' h';
    const d = new Date(t);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function uid(prefix) {
    const r = (crypto && crypto.getRandomValues) ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('') : Math.random().toString(16).slice(2, 14);
    return (prefix || 'id') + '_' + Date.now().toString(36) + r;
  }
  function slug(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cliente';
  }
  function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function digits(s) { return String(s || '').replace(/\D/g, ''); }
  function formatPhone(s) {
    let d = digits(s);
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return s || '';
  }
  function debounce(fn, ms) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }

  V.util = {
    MONTHS, MONTHS_SHORT, WEEKDAYS, WEEKDAYS_SHORT, esc, money, moneyShort, parseMoney, pad, ymd, parseYmd, today, ym, currentYm,
    ymParts, addMonths, addDays, daysBetween, daysInMonth, monthLabel, dateBR, dateShort, weekday, relDays, timeAgo, uid, slug, norm,
    digits, formatPhone, debounce,
  };
})(window.Vulpes = window.Vulpes || {});
