/* Feriados nacionais do Brasil e cálculo de dias úteis (5º dia útil).
 * Fixos: Lei 662/1949 e alterações, incluindo 20/11 (Lei 14.759/2023, a partir de 2024).
 * Móveis: Sexta-feira Santa (feriado nacional). Opcional, ligado por padrão: Carnaval (seg e ter)
 * e Corpus Christi, que não são feriados nacionais por lei, mas não têm expediente bancário. */
(function (V) {
  'use strict';
  const U = V.util;

  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(y, month - 1, day);
  }

  const cache = new Map();
  /** Map AAAA-MM-DD → nome do feriado, para o ano. */
  function holidays(y, includeBankDays) {
    const key = y + ':' + (includeBankDays ? 1 : 0);
    if (cache.has(key)) return cache.get(key);
    const map = new Map();
    const fixed = [
      ['01-01', 'Confraternização Universal'], ['04-21', 'Tiradentes'], ['05-01', 'Dia do Trabalho'],
      ['09-07', 'Independência do Brasil'], ['10-12', 'Nossa Senhora Aparecida'], ['11-02', 'Finados'],
      ['11-15', 'Proclamação da República'], ['12-25', 'Natal'],
    ];
    if (y >= 2024) fixed.push(['11-20', 'Consciência Negra']);
    fixed.forEach(([md, name]) => map.set(y + '-' + md, name));
    const e = easter(y);
    const rel = (n) => { const d = new Date(e); d.setDate(d.getDate() + n); return U.ymd(d); };
    map.set(rel(-2), 'Sexta-feira Santa');
    if (includeBankDays) {
      map.set(rel(-48), 'Carnaval');
      map.set(rel(-47), 'Carnaval');
      map.set(rel(60), 'Corpus Christi');
    }
    cache.set(key, map);
    return map;
  }

  function holidayName(dateStr, includeBankDays) {
    return holidays(Number(dateStr.slice(0, 4)), includeBankDays).get(dateStr) || null;
  }

  function isBusinessDay(dateStr, includeBankDays) {
    const dow = U.parseYmd(dateStr).getDay();
    if (dow === 0 || dow === 6) return false;
    return !holidayName(dateStr, includeBankDays);
  }

  /** N-ésimo dia útil do mês (y, m 1-12). */
  function nthBusinessDay(y, m, n, includeBankDays) {
    let count = 0;
    const last = U.daysInMonth(y, m);
    for (let d = 1; d <= last; d++) {
      const s = y + '-' + U.pad(m) + '-' + U.pad(d);
      if (isBusinessDay(s, includeBankDays) && ++count === n) return s;
    }
    return y + '-' + U.pad(m) + '-' + U.pad(last);
  }

  /** Data de vencimento de um cliente num mês "AAAA-MM". */
  function dueDateFor(client, monthStr, includeBankDays) {
    const { y, m } = U.ymParts(monthStr);
    if (client.dueRule === 'bd5') return nthBusinessDay(y, m, 5, includeBankDays);
    const day = Math.min(Math.max(1, Number(client.dueDay) || 1), U.daysInMonth(y, m));
    return y + '-' + U.pad(m) + '-' + U.pad(day);
  }

  function dueRuleLabel(client) {
    return client.dueRule === 'bd5' ? '5º dia útil' : 'Dia ' + (Number(client.dueDay) || 1);
  }

  V.cal = { easter, holidays, holidayName, isBusinessDay, nthBusinessDay, dueDateFor, dueRuleLabel };
})(window.Vulpes = window.Vulpes || {});
