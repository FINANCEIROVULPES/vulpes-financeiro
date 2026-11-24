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
      next.finally(() => { if (chains.get(key) === next) chains.delete(key); }).catch(() => {});
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

  /* ---------- Supabase (versão web na Vercel): banco na nuvem com login das sócias ---------- */
  const TABLES = { expenseEntries: 'expense_entries' };
  const tableOf = (col) => TABLES[col] || col;

  function SupabaseAdapter(sb) {
    const enqueue = makeQueue();
    const strip = (data) => { const o = JSON.parse(JSON.stringify(data)); delete o.id; return o; };
    const fail = (error) => {
      const e = new Error(error.message || 'Erro no banco de dados');
      e.code = error.code === 'P0002' ? 'invalid_argument' : (error.code || 'unknown');
      throw e;
    };
    const withRetry = async (fn) => {
      const run = async () => { const { error } = await fn(); if (error) fail(error); };
      try { return await run(); } catch (e) {
        if (e && e.code === 'invalid_argument') throw e;
        await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
        return run();
      }
    };
    async function fetchAll(table) {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from(table).select('id,data').order('id').range(from, from + 999);
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      return rows;
    }
    return {
      kind: 'supabase',
      subscribe(col, onData, onError) {
        const table = tableOf(col);
        const docs = new Map();
        let closed = false, loaded = false, pending = [];
        const emit = () => onData(Array.from(docs.entries()).map(([id, d]) => Object.assign({ id }, d)), { definitive: true });
        const apply = (p) => {
          if (p.eventType === 'DELETE') { if (p.old && p.old.id) docs.delete(p.old.id); } else if (p.new && p.new.id) docs.set(p.new.id, p.new.data || {});
        };
        // Ouve as mudanças antes da primeira leitura para não perder nada entre uma e outra.
        const channel = sb.channel('vf-' + table)
          .on('postgres_changes', { event: '*', schema: 'public', table }, (p) => {
            if (!loaded) { pending.push(p); return; }
            apply(p); emit();
          })
          .subscribe((status, err) => {
            if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && onError) onError(err || new Error('Sem atualização ao vivo: ' + status));
          });
        fetchAll(table).then((rows) => {
          if (closed) return;
          rows.forEach((r) => docs.set(r.id, r.data || {}));
          loaded = true; pending.forEach(apply); pending = [];
          emit();
        }).catch((e) => onError && onError(e));
        return () => { closed = true; sb.removeChannel(channel); };
      },
      set(col, id, data) {
        return enqueue(col + '/' + id, () => withRetry(() => sb.from(tableOf(col)).upsert({ id, data: strip(data) })));
      },
      update(col, id, patch) {
        return enqueue(col + '/' + id, () => withRetry(() => sb.rpc('mescla_campos', { tabela: tableOf(col), registro: id, campos: strip(patch) })));
      },
      remove(col, id) {
        return enqueue(col + '/' + id, () => withRetry(() => sb.from(tableOf(col)).delete().eq('id', id)));
      },
    };
  }

  /* Escolhe o adaptador: Supabase na versão web com login; armazenamento do Claude quando publicado no claude.ai;
   * senão, o navegador. */
  async function connect(seed) {
    if (V.auth && V.auth.client && V.auth.user) return SupabaseAdapter(V.auth.client);
    if (window.claude && typeof window.claude.use === 'function') {
      try {
        const db = await window.claude.use('db');
        if (db) return ClaudeDbAdapter(db);
      } catch (e) { /* segue para o local */ }
    }
    return LocalAdapter(seed);
  }

  V.storage = { connect, ClaudeDbAdapter, LocalAdapter, SupabaseAdapter, COLLECTIONS, LS_KEY };
})(window.Vulpes = window.Vulpes || {});
