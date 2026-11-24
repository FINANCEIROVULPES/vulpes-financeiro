/* JOBS (serviços adicionais): regras de parcelas, andamento financeiro e a lista unificada de cobranças
 * (mensalidades + parcelas de jobs) usada pela Central de Cobranças, Painel e Calendário. */
(function (V) {
  'use strict';
  const U = V.util, S = V.store;

  const JOB_STATUS = { pendente: 'Pendente', parcial: 'Parcial', pago: 'Pago', atraso: 'Em atraso' };
  const ORDINAL = ['primeira', 'segunda', 'terceira', 'quarta', 'quinta', 'sexta', 'sétima', 'oitava', 'nona', 'décima', 'décima primeira', 'décima segunda'];
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  function parcelaLabel(idx, count) {
    if (count === 1) return 'parcela única';
    return (ORDINAL[idx] || (idx + 1) + 'ª') + ' parcela';
  }

  /** Padrão: 50% no aceite + 50% na segunda etapa. */
  function defaultInstallments(total, contractDate, method) {
    const first = round2(total / 2);
    return [
      { id: 'p1', label: 'Aceite do orçamento', condition: 'No aceite', percent: 50, amount: first, dueDate: contractDate || U.today(), paymentMethod: method || 'pix' },
      { id: 'p2', label: 'Segunda etapa', condition: 'Na entrega', percent: 50, amount: round2(total - first), dueDate: '', paymentMethod: method || 'pix' },
    ];
  }

  function instStatus(inst, ref) { return S.effStatus(inst, ref); }

  function summary(job, ref) {
    ref = ref || U.today();
    const inst = job.installments || [];
    const total = round2(job.total);
    let received = 0, pendingAmt = 0, late = false, paidCount = 0;
    inst.forEach((i) => {
      if (i.status === 'pago') { received += Number(i.paidAmount != null ? i.paidAmount : i.amount) || 0; paidCount++; }
      else { pendingAmt += Number(i.amount) || 0; if (S.isOverdue(i, ref)) late = true; }
    });
    received = round2(received); pendingAmt = round2(pendingAmt);
    const open = inst.filter((i) => i.status !== 'pago');
    const dated = open.filter((i) => i.dueDate).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
    const next = dated[0] || open[0] || null;
    const status = inst.length && paidCount === inst.length ? 'pago' : late ? 'atraso' : paidCount > 0 ? 'parcial' : 'pendente';
    return { total, received, pending: pendingAmt, pct: total ? Math.min(100, Math.round((received / total) * 100)) : 0, next, status, paidCount, count: inst.length };
  }

  const jobById = (id) => S.state.jobs.find((j) => j.id === id) || null;

  /* ---------- Lista unificada de cobranças ---------- */
  function fromCharge(c) {
    return {
      kind: 'mensalidade', key: c.id, id: c.id, clientId: c.clientId, clientName: c.clientName, amount: Number(c.amount) || 0,
      dueDate: c.dueDate, paymentMethod: c.paymentMethod, status: c.status, sentAt: c.sentAt, sentKind: c.sentKind, sentCount: c.sentCount,
      paidAt: c.paidAt, paidAmount: c.paidAmount, month: c.month, ref: U.monthLabel(c.month), raw: c,
    };
  }
  function fromInst(job, inst, idx) {
    const n = (job.installments || []).length;
    return {
      kind: 'job', key: 'j:' + job.id + ':' + inst.id, id: 'j:' + job.id + ':' + inst.id, jobId: job.id, instId: inst.id, clientId: job.clientId, clientName: job.clientName,
      amount: Number(inst.amount) || 0, dueDate: inst.dueDate || '', paymentMethod: inst.paymentMethod || job.paymentMethod, status: inst.status || 'aguardando',
      sentAt: inst.sentAt, sentKind: inst.sentKind, sentCount: inst.sentCount, paidAt: inst.paidAt, paidAmount: inst.paidAmount,
      title: job.title, instLabel: inst.label, condition: inst.condition, instIndex: idx, instCount: n,
      parcela: parcelaLabel(idx, n), month: inst.dueDate ? inst.dueDate.slice(0, 7) : '',
      ref: job.title + ' · ' + (n > 1 ? (idx + 1) + 'ª de ' + n : 'parcela única') + (inst.label ? ' (' + inst.label + ')' : ''), raw: inst,
    };
  }
  function jobItems() {
    const out = [];
    S.state.jobs.forEach((j) => (j.installments || []).forEach((i, idx) => out.push(fromInst(j, i, idx))));
    return out;
  }
  function allItems() { return S.state.charges.map(fromCharge).concat(jobItems()); }
  function itemByKey(key) {
    if (String(key).startsWith('j:')) {
      const [, jobId, instId] = String(key).split(':');
      const j = jobById(jobId);
      if (!j) return null;
      const idx = (j.installments || []).findIndex((i) => i.id === instId);
      return idx < 0 ? null : fromInst(j, j.installments[idx], idx);
    }
    const c = S.state.charges.find((x) => x.id === key);
    return c ? fromCharge(c) : null;
  }

  /* ---------- Escrita ---------- */
  function cleanInstallments(list, prevList, jobMethod) {
    const prev = new Map((prevList || []).map((i) => [i.id, i]));
    return list.map((i, idx) => {
      const p = prev.get(i.id) || {};
      return {
        id: i.id || 'p' + (idx + 1) + '-' + Date.now().toString(36).slice(-3),
        label: String(i.label || '').trim() || 'Parcela ' + (idx + 1),
        condition: String(i.condition || '').trim(),
        percent: round2(i.percent), amount: round2(U.parseMoney(i.amount)),
        dueDate: i.dueDate || '', paymentMethod: i.paymentMethod === 'boleto' ? 'boleto' : (i.paymentMethod === 'pix' ? 'pix' : jobMethod),
        status: p.status || 'aguardando', paidAt: p.paidAt || null, paidAmount: p.paidAmount != null ? p.paidAmount : null,
        sentAt: p.sentAt || null, sentKind: p.sentKind || null, sentCount: p.sentCount || 0,
      };
    });
  }

  async function saveJob(data) {
    const repo = S._repo();
    const isNew = !data.id;
    const id = data.id || 'j_' + U.slug(data.title).slice(0, 24) + '-' + Date.now().toString(36);
    const prev = jobById(id);
    const client = S.clientById(data.clientId);
    const method = data.paymentMethod === 'boleto' ? 'boleto' : 'pix';
    const doc = {
      clientId: data.clientId, clientName: client ? client.name : (data.clientName || ''),
      title: data.title.trim(), description: (data.description || '').trim(), total: round2(U.parseMoney(data.total)),
      contractDate: data.contractDate || U.today(), paymentMethod: method, notes: (data.notes || '').trim(),
      installments: cleanInstallments(data.installments, prev && prev.installments, method),
      createdAt: (prev && prev.createdAt) || new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const ok = await S.guard(repo.set('jobs', id, doc), isNew ? 'Job cadastrado.' : 'Job atualizado.');
    if (!ok) return null;
    S.log('job', (isNew ? 'Novo job: ' : 'Job atualizado: ') + doc.title + ' · ' + doc.clientName, { clientId: doc.clientId, jobId: id, amount: isNew ? doc.total : undefined });
    return id;
  }

  async function deleteJob(id) {
    const j = jobById(id);
    if (!j) return;
    const ok = await S.guard(S._repo().remove('jobs', id), 'Job excluído.');
    if (ok) S.log('job', 'Job excluído: ' + j.title + ' · ' + j.clientName, { clientId: j.clientId });
  }

  async function patchInstallment(jobId, instId, mut) {
    const j = jobById(jobId);
    if (!j) return false;
    const list = (j.installments || []).map((i) => (i.id === instId ? Object.assign({}, i, mut(i)) : i));
    return S.guard(S._repo().update('jobs', jobId, { installments: list, updatedAt: new Date().toISOString() }));
  }

  async function setInstallmentStatus(jobId, instId, status, opts) {
    opts = opts || {};
    const item = itemByKey('j:' + jobId + ':' + instId);
    if (!item) return false;
    const ok = await patchInstallment(jobId, instId, (i) => {
      const p = { status };
      if (status === 'pago') { p.paidAt = opts.paidAt || U.today(); p.paidAmount = opts.paidAmount != null ? round2(U.parseMoney(opts.paidAmount)) : i.amount; }
      else { p.paidAt = null; p.paidAmount = null; }
      if (status === 'enviada') { p.sentAt = new Date().toISOString(); p.sentKind = opts.sentKind || null; p.sentCount = (i.sentCount || 0) + 1; }
      return p;
    });
    if (!ok) return false;
    const ref = item.clientName + ' · ' + item.title + ' (' + item.parcela + ')';
    const base = { clientId: item.clientId, jobId, instId };
    if (status === 'pago') {
      V.ui.toast('Pagamento da parcela registrado.');
      S.log('payment', 'Parcela de job recebida: ' + ref, Object.assign(base, { amount: opts.paidAmount != null ? round2(U.parseMoney(opts.paidAmount)) : item.amount, date: opts.paidAt || U.today() }));
    } else if (status === 'enviada') {
      V.ui.toast('Cobrança marcada como enviada.');
      S.log('sent', 'Cobrança de job enviada: ' + ref + (opts.sentKind === 'job_atraso' ? ' (lembrete de atraso)' : ''), Object.assign(base, { amount: item.amount }));
    } else {
      V.ui.toast('Status atualizado: ' + S.STATUS[status] + '.');
      S.log('status', ref + ': ' + S.STATUS[status], base);
    }
    return true;
  }

  async function updateInstallment(jobId, instId, fields) {
    const ok = await patchInstallment(jobId, instId, () => {
      const p = {};
      if (fields.paidAt) p.paidAt = fields.paidAt;
      if (fields.paidAmount != null && fields.paidAmount !== '') p.paidAmount = round2(U.parseMoney(fields.paidAmount));
      if (fields.dueDate != null) p.dueDate = fields.dueDate;
      return p;
    });
    if (ok) V.ui.toast('Parcela atualizada.');
    return ok;
  }

  /** Muda o status de qualquer cobrança (mensalidade ou parcela de job). */
  function setItemStatus(key, status, opts) {
    if (String(key).startsWith('j:')) { const [, jobId, instId] = String(key).split(':'); return setInstallmentStatus(jobId, instId, status, opts); }
    return S.setChargeStatus(key, status, opts);
  }

  /* ---------- Indicadores ---------- */
  function monthJobs(month) {
    const t = U.today();
    const items = jobItems();
    const contracted = S.state.jobs.filter((j) => (j.contractDate || '').slice(0, 7) === month);
    const receivedItems = items.filter((i) => i.status === 'pago' && (i.paidAt || '').slice(0, 7) === month);
    const dueItems = items.filter((i) => i.month === month);
    const openItems = items.filter((i) => i.status !== 'pago');
    const running = S.state.jobs.filter((j) => summary(j, t).status !== 'pago');
    const sumAmt = (arr) => round2(arr.reduce((a, i) => a + (Number(i.amount) || 0), 0));
    return {
      contracted: round2(contracted.reduce((a, j) => a + (Number(j.total) || 0), 0)), contractedCount: contracted.length,
      received: round2(receivedItems.reduce((a, i) => a + (Number(i.paidAmount != null ? i.paidAmount : i.amount) || 0), 0)), receivedCount: receivedItems.length,
      dueInMonth: sumAmt(dueItems), dueItems,
      pending: sumAmt(openItems), pendingCount: openItems.length,
      late: sumAmt(openItems.filter((i) => S.isOverdue(i, t))), lateCount: openItems.filter((i) => S.isOverdue(i, t)).length,
      running: running.length,
      receivedItems,
    };
  }

  V.jobs = {
    JOB_STATUS, parcelaLabel, defaultInstallments, summary, jobById, instStatus, round2,
    fromCharge, fromInst, jobItems, allItems, itemByKey, saveJob, deleteJob, setInstallmentStatus, updateInstallment, setItemStatus, monthJobs,
  };
})(window.Vulpes = window.Vulpes || {});
