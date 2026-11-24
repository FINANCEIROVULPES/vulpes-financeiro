/* Mensagens de cobrança e canais de envio.
 *
 * Nenhum canal envia nada sozinho. Hoje o canal ativo é o "WhatsApp manual": o app monta o link
 * wa.me com o texto e quem usa decide enviar no próprio WhatsApp. O canal "WhatsApp Business API"
 * já tem o formato pronto para uma integração futura e exige confirmação explícita a cada envio.
 */
(function (V) {
  'use strict';
  const U = V.util;

  const DEFAULT_TEMPLATES = {
    pix:
      'Olá {nome}, tudo bem? Passando para te encaminhar as informações da mensalidade da {agencia} referente a {mes}.\n\n' +
      'Valor: {valor}\nVencimento: {vencimento}\nPIX: {pix}\n\nQualquer dúvida, estamos à disposição! 💜',
    boleto:
      'Olá {nome}, tudo bem? Passando para lembrar da mensalidade da {agencia} referente a {mes}.\n\n' +
      'Valor: {valor}\nVencimento: {vencimento}\n\nO boleto está disponível para pagamento. Qualquer dúvida, é só nos chamar! 💜',
    atraso:
      'Olá {nome}, tudo bem? Estamos passando para verificar se conseguiu realizar o pagamento da mensalidade da {agencia}, com vencimento em {vencimento}.\n\n' +
      'Caso já tenha realizado, pode desconsiderar esta mensagem. Se precisar de alguma informação, estamos à disposição! 💜',
    job:
      'Olá {nome}, tudo bem? Passando para te encaminhar as informações da {parcela} referente ao serviço de {servico}.\n\n' +
      'Valor: {valor}\nVencimento: {vencimento}\nPIX: {pix}\n\nQualquer dúvida, estamos à disposição! 💜',
    job_atraso:
      'Olá {nome}, tudo bem? Estamos passando para verificar se conseguiu realizar o pagamento da {parcela} referente ao serviço de {servico}, com vencimento em {vencimento}.\n\n' +
      'Caso já tenha realizado, pode desconsiderar esta mensagem. Se precisar de alguma informação, estamos à disposição! 💜',
  };

  const PLACEHOLDERS = [
    ['{nome}', 'Nome do contato (ou do cliente)'],
    ['{cliente}', 'Nome do cliente'],
    ['{valor}', 'Valor da mensalidade'],
    ['{vencimento}', 'Data de vencimento'],
    ['{mes}', 'Mês de referência'],
    ['{forma}', 'PIX ou boleto'],
    ['{pix}', 'Chave PIX'],
    ['{agencia}', 'Nome curto da agência'],
    ['{servico}', 'Nome do job (só jobs)'],
    ['{parcela}', 'Ex.: segunda parcela (só jobs)'],
    ['{etapa}', 'Nome da etapa (só jobs)'],
  ];

  /** Qual modelo usar: atraso tem prioridade; senão, pela forma de pagamento. */
  function templateKind(charge, isLate) {
    if (charge.kind === 'job') return isLate ? 'job_atraso' : 'job';
    if (isLate) return 'atraso';
    return charge.paymentMethod === 'pix' ? 'pix' : 'boleto';
  }

  function fill(tpl, vars) {
    return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m));
  }

  function varsFor(charge, client, settings) {
    const pix = charge.paymentMethod === 'pix' ? ((client && client.pixKey) || settings.pixKey || '') : '';
    return {
      nome: (client && client.contactName) || (client && client.name) || charge.clientName || '',
      cliente: (client && client.name) || charge.clientName || '',
      valor: U.money(charge.amount),
      vencimento: charge.dueDate ? U.dateBR(charge.dueDate) : (charge.condition ? String(charge.condition).toLowerCase() : 'a combinar'),
      mes: charge.month ? U.monthLabel(charge.month, { noYear: true }) : '',
      servico: charge.title || '',
      parcela: charge.parcela || '',
      etapa: charge.instLabel || '',
      forma: charge.paymentMethod === 'pix' ? 'PIX' : 'boleto',
      pix,
      agencia: settings.shortName || 'Vulpes',
    };
  }

  function build(charge, client, settings, kind) {
    const templates = Object.assign({}, DEFAULT_TEMPLATES, settings.templates || {});
    let text = fill(templates[kind] || DEFAULT_TEMPLATES[kind], varsFor(charge, client, settings)).replace(/\n{3,}/g, '\n\n');
    // Boleto: nunca levar a chave PIX, mesmo que o modelo tenha sido editado com {pix}.
    if (charge.paymentMethod !== 'pix') text = text.split('\n').filter((l) => !/^\s*PIX:\s*$/i.test(l)).join('\n');
    return text;
  }

  /** Telefone em formato internacional (só dígitos). Números com 10 ou 11 dígitos ganham o 55. */
  function waNumber(phone) {
    let d = U.digits(phone);
    if (!d) return '';
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return d;
  }

  /* ---------- Canais ---------- */
  const ManualWhatsApp = {
    id: 'whatsapp-manual',
    label: 'WhatsApp (abrir conversa)',
    automatic: false,
    /** Link para abrir a conversa com o texto preenchido. Não envia nada. */
    link(phone, text) {
      const n = waNumber(phone);
      return 'https://wa.me/' + n + '?text=' + encodeURIComponent(text);
    },
  };

  /* Estrutura para a integração futura com a WhatsApp Business (Cloud) API.
   * Para ativar: implementar `transport` (chamada ao seu servidor, que guarda o token da Meta)
   * e passar `confirmedByUser: true` somente a partir de um clique de confirmação na tela. */
  const WhatsAppBusinessApi = {
    id: 'whatsapp-business-api',
    label: 'WhatsApp Business API',
    automatic: false,
    transport: null,
    isConfigured() { return typeof this.transport === 'function'; },
    async send({ to, text, confirmedByUser }) {
      if (!confirmedByUser) throw new Error('Envio bloqueado: é preciso confirmar manualmente cada mensagem.');
      if (!this.isConfigured()) throw new Error('A integração com a WhatsApp Business API ainda não foi configurada.');
      return this.transport({ to: waNumber(to), type: 'text', text: { body: text } });
    },
  };

  V.messaging = { DEFAULT_TEMPLATES, PLACEHOLDERS, templateKind, fill, varsFor, build, waNumber, channels: { manual: ManualWhatsApp, api: WhatsAppBusinessApi } };
})(window.Vulpes = window.Vulpes || {});
