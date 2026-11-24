/* Camada de dados. O app só conversa com a interface abaixo, então trocar o armazenamento
 * (por exemplo, por uma API própria) não exige mexer nas telas.
 *
 * Interface de um adaptador:
 *   kind: string                       identificação ("claude-db" | "local")
 *   subscribe(col, onData, onError)    onData(lista de {id, ...campos}, {definitive}) → função para cancelar
 *   set(col, id, data)                 grava o documento inteiro
 *   update(col, id, patch)             mescla campos num documento existente
 *   remove(col, id)                    apaga o documento
 *
 * Coleções: clients, charges (mensalidades, id = <clienteId>_<AAAA-MM>), jobs (serviços adicionais com parcelas),
 * expenses (cadastro de despesas), expenseEntries (lançamentos mensais de despesas), activity, settings (doc "main").
 */
(function (V) {
  'use strict';

  const COLLECTIONS = ['clients', 'charges', 'jobs', 'expenses', 'expenseEntries', 'settlements', 'activity', 'settings'];

  /* Uma escrita por vez para cada documento (exigência do armazenamento compartilhado). */
  function makeQueue() {
    const chains = new Map();
    return function enqueue(key, fn) {
      const prev = chains.get(key) || Promise.resolve();
      const next = prev.catch(() => {}).then(fn);
      chains.set(key, next);
      next.finally(() => { if (chains.get(key) === next) chains.delete(key); });
      return next;
    };
  }

  /* ---------- Armazenamento do Claude (artifact db): persiste no servidor ---------- */
  function ClaudeDbAdapter(db) {
    const enqueue = makeQueue();
    const withRetry = async (fn) => {
      try { return await fn(); } catch (e) {
        if (e && e.code === 'unavailable') { await new Promise((r) => setTimeout(r, 400 + Math.random() * 600)); return fn(); }
        throw e;
      }
    };
    const strip = (data) => { const o = Object.assign({}, data); delete o.id; return JSON.parse(JSON.stringify(o)); };
    return {
      kind: 'claude-db',
      subscribe(col, onData, onError) {
        return db.collection(col).onSnapshot(
          (snap) => onData(snap.docs.map((d) => Object.assign({ id: d.id }, d.data())), { definitive: !snap.metadata.fromCache }),
          (err) => onError && onError(err),
        );
      },
      set(col, id, data) { return enqueue(col + '/' + id, () => withRetry(() => db.collection(col).doc(id).set(strip(data)))); },
      update(col, id, patch) { return enqueue(col + '/' + id, () => withRetry(() => db.collection(col).doc(id).update(strip(patch)))); },
      remove(col, id) { return enqueue(col + '/' + id, () => withRetry(() => db.collection(col).doc(id).delete())); },
    };
  }

  /* ---------- Armazenamento local (navegador): usado ao abrir o arquivo direto no computador ---------- */
  const LS_KEY = 'vulpes-financeiro:v1';

  function LocalAdapter(seed) {
    let mem = null;
    const listeners = new Map(COLLECTIONS.map((c) => [c, new Set()]));
    const load = () => {
      try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch (e) { /* sem acesso ao armazenamento */ }
      return null;
    };
    const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(mem)); } catch (e) { V.ui && V.ui.toast('Não foi possível salvar neste navegador.', true); } };
    mem = load();
    if (!mem) {
      mem = { clients: {}, charges: {}, activity: {}, settings: {} };
      (seed && seed.clients || []).forEach((c) => { mem.clients[c.id] = c; });
      save();
    }
    COLLECTIONS.forEach((c) => { mem[c] = mem[c] || {}; });
    // Despesas iniciais entram uma única vez, também em navegadores que já tinham dados.
    if (!mem._seededExpenses) {
      (seed && seed.expenses || []).forEach((e) => { if (!mem.expenses[e.id]) mem.expenses[e.id] = Object.assign({}, e); });
      mem._seededExpenses = true;
    }
    if (!mem._seededPayers) {
      // Quem paga cada despesa inicial (rateio Karol e Natasha).
      (seed && seed.expenses || []).forEach((e) => { const cur = mem.expenses[e.id]; if (cur && cur.payer == null) Object.assign(cur, { payer: e.payer, name: e.name, installmentCurrent: e.installmentCurrent }); });
      Object.keys(mem.expenseEntries || {}).forEach((k) => { if (k.indexOf('e_notebook_') === 0 && mem.expenseEntries[k].status !== 'pago') delete mem.expenseEntries[k]; });
      mem._seededPayers = true;
      save();
    }
    const list = (col) => Object.keys(mem[col]).map((id) => Object.assign({ id }, mem[col][id]));
    const emit = (col) => listeners.get(col).forEach((fn) => fn(list(col), { definitive: true }));
    window.addEventListener('storage', (e) => {
      if (e.key !== LS_KEY || !e.newValue) return;
      try { mem = JSON.parse(e.newValue); COLLECTIONS.forEach((c) => { mem[c] = mem[c] || {}; emit(c); }); } catch (err) { /* ignora */ }
    });
    const clean = (data) => { const o = JSON.parse(JSON.stringify(data)); delete o.id; return o; };
    return {
      kind: 'local',
      subscribe(col, onData) {
        listeners.get(col).add(onData);
        setTimeout(() => onData(list(col), { definitive: true }), 0);
        return () => listeners.get(col).delete(onData);
      },
      async set(col, id, data) { mem[col][id] = clean(data); save(); emit(col); },
      async update(col, id, patch) {
        if (!mem[col][id]) throw { code: 'invalid_argument', message: 'Documento não existe' };
        mem[col][id] = Object.assign({}, mem[col][id], clean(patch)); save(); emit(col);
      },
      async remove(col, id) { delete mem[col][id]; save(); emit(col); },
    };
  }

  /* Escolhe o adaptador: armazenamento do Claude quando o app roda publicado; senão, o navegador. */
  async function connect(seed) {
    if (window.claude && typeof window.claude.use === 'function') {
      try {
        const db = await window.claude.use('db');
        if (db) return ClaudeDbAdapter(db);
      } catch (e) { /* segue para o local */ }
    }
    return LocalAdapter(seed);
  }

  V.storage = { connect, ClaudeDbAdapter, LocalAdapter, COLLECTIONS, LS_KEY };
})(window.Vulpes = window.Vulpes || {});
