// Função "asaas": ponte entre o Vulpes Financeiro e a API do Asaas.
// - A chave do Asaas fica só no secret ASAAS_API_KEY (nunca no código, no site ou no GitHub).
// - Toda chamada precisa do header x-vulpes-token igual ao valor guardado em public.integracao_config,
//   tabela que ninguém lê pela API (RLS sem regras); só esta função, com a service role.
// - Lê clientes e assinaturas; atualiza contato e notificações de clientes; cria assinaturas mensais.
// - Ajusta datas de cobranças pendentes para dia útil (verificação diária).
// - Nunca saca, transfere nem apaga nada.
import { createClient } from "jsr:@supabase/supabase-js@2";

const ASAAS = "https://api.asaas.com/v3";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function tokenInterno(): Promise<string | null> {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data } = await sb.from("integracao_config").select("valor").eq("chave", "asaas_token_interno").maybeSingle();
  return data?.valor ?? null;
}

function iguais(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function asaasGet(path: string) {
  const key = Deno.env.get("ASAAS_API_KEY");
  if (!key) throw new Error("ASAAS_API_KEY não configurada");
  const r = await fetch(ASAAS + path, {
    headers: { access_token: key, "User-Agent": "VulpesFinanceiro", "Content-Type": "application/json" },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Asaas " + r.status + ": " + JSON.stringify(body?.errors ?? body));
  return body;
}

async function asaasPost(path: string, payload: unknown) {
  const key = Deno.env.get("ASAAS_API_KEY");
  if (!key) throw new Error("ASAAS_API_KEY não configurada");
  const r = await fetch(ASAAS + path, {
    method: "POST",
    headers: { access_token: key, "User-Agent": "VulpesFinanceiro", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Asaas " + r.status + ": " + JSON.stringify(body?.errors ?? body));
  return body;
}

async function listarTodos(path: string) {
  const itens: any[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const sep = path.includes("?") ? "&" : "?";
    const page = await asaasGet(`${path}${sep}limit=100&offset=${offset}`);
    itens.push(...(page.data ?? []));
    if (!page.hasMore) break;
  }
  return itens;
}

// ---- Calendário (mesma regra do sistema, src/js/calendar-br.js) ----
// Datas tratadas como AAAA-MM-DD em UTC, sem fuso.
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
const parse = (s: string) => new Date(s + "T00:00:00Z");
const somaDias = (s: string, n: number) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const diasEntre = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
const diasNoMes = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function pascoa(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return y + "-" + pad(mes) + "-" + pad(dia);
}
function feriados(y: number, bancarios: boolean) {
  const f = new Set(["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"].map((md) => y + "-" + md));
  if (y >= 2024) f.add(y + "-11-20");
  const p = pascoa(y);
  f.add(somaDias(p, -2));
  if (bancarios) { f.add(somaDias(p, -48)); f.add(somaDias(p, -47)); f.add(somaDias(p, 60)); }
  return f;
}
function diaUtil(s: string, bancarios: boolean) {
  const dow = parse(s).getUTCDay();
  return dow !== 0 && dow !== 6 && !feriados(Number(s.slice(0, 4)), bancarios).has(s);
}
function proximoDiaUtil(s: string, bancarios: boolean) {
  for (let i = 0; i < 15 && !diaUtil(s, bancarios); i++) s = somaDias(s, 1);
  return s;
}
function enesimoDiaUtil(y: number, m: number, n: number, bancarios: boolean) {
  let c = 0;
  for (let d = 1; d <= diasNoMes(y, m); d++) {
    const s = y + "-" + pad(m) + "-" + pad(d);
    if (diaUtil(s, bancarios) && ++c === n) return s;
  }
  return y + "-" + pad(m) + "-" + pad(diasNoMes(y, m));
}
/** Vencimento certo de um cliente num mês (y, m 1-12). */
function vencimentoDoMes(cli: { dueRule?: string; dueDay?: unknown }, y: number, m: number, bancarios: boolean) {
  if (cli.dueRule === "bd5") return enesimoDiaUtil(y, m, 5, bancarios);
  const dia = Math.min(Math.max(1, Number(cli.dueDay) || 1), diasNoMes(y, m));
  return proximoDiaUtil(y + "-" + pad(m) + "-" + pad(dia), bancarios);
}
function hojeBrasil() {
  return ymd(new Date(Date.now() - 3 * 3600 * 1000));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "método não permitido" }, 405);
  const recebido = req.headers.get("x-vulpes-token") ?? "";
  const esperado = await tokenInterno();
  if (!esperado || !iguais(recebido, esperado)) return json({ erro: "não autorizado" }, 401);

  let acao = "";
  let dados: any = {};
  try { dados = (await req.json()) ?? {}; acao = dados.acao ?? ""; } catch { /* corpo vazio */ }

  try {
    if (acao === "listar_clientes") {
      const clientes = await listarTodos("/customers");
      return json({
        total: clientes.length,
        clientes: clientes.map((c) => ({
          id: c.id, nome: c.name, cpfCnpj: c.cpfCnpj, email: c.email, emailsAdicionais: c.additionalEmails, celular: c.mobilePhone,
          referencia: c.externalReference, notificacoesDesligadas: c.notificationDisabled, excluido: c.deleted,
        })),
      });
    }
    if (acao === "listar_assinaturas") {
      const assinaturas = await listarTodos("/subscriptions");
      return json({
        total: assinaturas.length,
        assinaturas: assinaturas.map((s) => ({
          id: s.id, cliente: s.customer, valor: s.value, proximoVencimento: s.nextDueDate,
          ciclo: s.cycle, forma: s.billingType, status: s.status, referencia: s.externalReference,
        })),
      });
    }
    if (acao === "listar_cobrancas") {
      const sub = String(dados.assinatura ?? "");
      if (!/^sub_[A-Za-z0-9]+$/.test(sub)) return json({ erro: "id de assinatura inválido" }, 400);
      const cobr = await listarTodos("/payments?subscription=" + sub);
      return json({
        total: cobr.length,
        cobrancas: cobr.map((p) => ({
          id: p.id, valor: p.value, vencimento: p.dueDate, status: p.status, forma: p.billingType,
          linkFatura: p.invoiceUrl, linkBoleto: p.bankSlipUrl, referencia: p.externalReference,
        })),
      });
    }
    if (acao === "ver_personalizacao") {
      const c = await asaasGet("/myAccount/paymentCheckoutConfig/");
      return json({ ok: true, personalizacao: {
        status: c.status, motivoRecusa: c.observations ?? null, temLogo: !!c.logoUrl,
        corFundoLogo: c.logoBackgroundColor, corFundoInfo: c.infoBackgroundColor, corFonte: c.fontColor, ativa: c.enabled,
      } });
    }
    if (acao === "listar_notificacoes") {
      const id = String(dados.cliente ?? "");
      if (!/^cus_[A-Za-z0-9]+$/.test(id)) return json({ erro: "id de cliente inválido" }, 400);
      const n = await listarTodos("/customers/" + id + "/notifications");
      return json({ total: n.length, notificacoes: n.map((x) => ({
        id: x.id, evento: x.event, dias: x.scheduleOffset, ativa: x.enabled,
        email: x.emailEnabledForCustomer, sms: x.smsEnabledForCustomer, whatsapp: x.whatsappEnabledForCustomer,
        ligacao: x.phoneCallEnabledForCustomer, emailParaVoce: x.emailEnabledForProvider, smsParaVoce: x.smsEnabledForProvider,
      })) });
    }
    if (acao === "configurar_notificacoes") {
      // Só liga/desliga avisos e canais do cliente e ajusta dias; não envia nada.
      const id = String(dados.cliente ?? "");
      if (!/^cus_[A-Za-z0-9]+$/.test(id)) return json({ erro: "id de cliente inválido" }, 400);
      const lista = Array.isArray(dados.notificacoes) ? dados.notificacoes : [];
      if (!lista.length) return json({ erro: "lista de notificações vazia" }, 400);
      const permitidos = ["id", "enabled", "emailEnabledForCustomer", "smsEnabledForCustomer", "whatsappEnabledForCustomer", "phoneCallEnabledForCustomer", "scheduleOffset"];
      const limpa = lista.map((x: any) => Object.fromEntries(Object.entries(x).filter(([k]) => permitidos.includes(k))));
      if (limpa.some((x: any) => !/^not_[A-Za-z0-9]+$/.test(String(x.id ?? "")))) return json({ erro: "id de notificação inválido" }, 400);
      const r = await asaasPost("/notifications/batch", { customer: id, notifications: limpa });
      return json({ ok: true, atualizadas: (r.notifications ?? []).length });
    }
    if (acao === "valor_assinatura") {
      // Muda o valor mensal da assinatura e das cobranças pendentes dela (as já pagas não mudam).
      const sub = String(dados.assinatura ?? "");
      if (!/^sub_[A-Za-z0-9]+$/.test(sub)) return json({ erro: "id de assinatura inválido" }, 400);
      const valor = Number(dados.valor);
      if (!(valor > 0 && valor < 100000)) return json({ erro: "valor inválido" }, 400);
      const s = await asaasPost("/subscriptions/" + sub, { value: valor, updatePendingPayments: true });
      return json({ ok: true, assinatura: { id: s.id, valor: s.value, proximoVencimento: s.nextDueDate, forma: s.billingType } });
    }
    if (acao === "vencimento_assinatura") {
      // Muda a data do próximo vencimento da assinatura (os meses seguintes seguem esse dia).
      const sub = String(dados.assinatura ?? "");
      if (!/^sub_[A-Za-z0-9]+$/.test(sub)) return json({ erro: "id de assinatura inválido" }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dados.proximoVencimento ?? ""))) return json({ erro: "data inválida (AAAA-MM-DD)" }, 400);
      const s = await asaasPost("/subscriptions/" + sub, { nextDueDate: dados.proximoVencimento });
      return json({ ok: true, assinatura: { id: s.id, valor: s.value, proximoVencimento: s.nextDueDate } });
    }
    if (acao === "vencimento_cobranca") {
      // Muda a data de uma cobrança ainda pendente; valor e forma ficam iguais.
      const id = String(dados.cobranca ?? "");
      if (!/^pay_[A-Za-z0-9]+$/.test(id)) return json({ erro: "id de cobrança inválido" }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dados.vencimento ?? ""))) return json({ erro: "data inválida (AAAA-MM-DD)" }, 400);
      const atual = await asaasGet("/payments/" + id);
      if (atual.status !== "PENDING") return json({ erro: "só cobranças pendentes podem mudar de data (status: " + atual.status + ")" }, 409);
      const p = await asaasPost("/payments/" + id, { billingType: atual.billingType, value: atual.value, dueDate: dados.vencimento });
      return json({ ok: true, cobranca: { id: p.id, valor: p.value, vencimento: p.dueDate, status: p.status, linkFatura: p.invoiceUrl } });
    }
    if (acao === "descricao_assinatura") {
      // Muda só o texto da assinatura e das cobranças pendentes dela; valor, data e forma ficam iguais.
      const sub = String(dados.assinatura ?? "");
      if (!/^sub_[A-Za-z0-9]+$/.test(sub)) return json({ erro: "id de assinatura inválido" }, 400);
      const texto = String(dados.descricao ?? "").trim();
      if (!texto || texto.length > 500) return json({ erro: "descrição vazia ou longa demais" }, 400);
      const s = await asaasPost("/subscriptions/" + sub, { description: texto, updatePendingPayments: true });
      return json({ ok: true, assinatura: { id: s.id, descricao: s.description, valor: s.value, forma: s.billingType } });
    }
    if (acao === "atualizar_cliente") {
      // Só nome, celular, e-mail e e-mails adicionais; nada financeiro.
      const id = String(dados.id ?? "");
      if (!/^cus_[A-Za-z0-9]+$/.test(id)) return json({ erro: "id de cliente inválido" }, 400);
      const atual = await asaasGet("/customers/" + id);
      const patch: Record<string, string> = { name: dados.nome ?? atual.name };
      if (dados.celular !== undefined) patch.mobilePhone = String(dados.celular).replace(/\D/g, "");
      if (dados.email !== undefined) patch.email = String(dados.email);
      if (dados.emailsAdicionais !== undefined) patch.additionalEmails = String(dados.emailsAdicionais);
      const c = await asaasPost("/customers/" + id, patch);
      return json({ ok: true, cliente: { id: c.id, nome: c.name, celular: c.mobilePhone, email: c.email, emailsAdicionais: c.additionalEmails } });
    }
    if (acao === "notificacoes_cliente") {
      const id = String(dados.id ?? "");
      if (!/^cus_[A-Za-z0-9]+$/.test(id)) return json({ erro: "id de cliente inválido" }, 400);
      if (typeof dados.desligadas !== "boolean") return json({ erro: "informe desligadas: true ou false" }, 400);
      const atual = await asaasGet("/customers/" + id);
      const c = await asaasPost("/customers/" + id, { name: atual.name, notificationDisabled: dados.desligadas });
      return json({ ok: true, cliente: { id: c.id, nome: c.name, notificacoesDesligadas: c.notificationDisabled } });
    }
    if (acao === "criar_assinatura") {
      const id = String(dados.cliente ?? "");
      if (!/^cus_[A-Za-z0-9]+$/.test(id)) return json({ erro: "id de cliente inválido" }, 400);
      const valor = Number(dados.valor);
      if (!(valor > 0 && valor < 100000)) return json({ erro: "valor inválido" }, 400);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dados.vencimento ?? ""))) return json({ erro: "vencimento inválido (AAAA-MM-DD)" }, 400);
      if (!["PIX", "BOLETO"].includes(dados.forma)) return json({ erro: "forma deve ser PIX ou BOLETO" }, 400);
      const ref = String(dados.referencia ?? "");
      const cli = await asaasGet("/customers/" + id);
      // Trava: só cria com as notificações do cliente desligadas, salvo pedido explícito.
      if (!cli.notificationDisabled && dados.permitirAvisos !== true) {
        return json({ erro: "notificações do cliente estão ligadas; desligue antes ou envie permitirAvisos: true" }, 409);
      }
      // Evita duplicar: já existe assinatura ativa deste cliente com a mesma referência?
      const existentes = await listarTodos("/subscriptions?customer=" + id);
      const dup = existentes.find((x) => !x.deleted && x.status === "ACTIVE" && (ref ? x.externalReference === ref : true));
      if (dup) return json({ ok: true, jaExistia: true, assinatura: { id: dup.id, valor: dup.value, proximoVencimento: dup.nextDueDate, forma: dup.billingType } });
      const s = await asaasPost("/subscriptions", {
        customer: id, billingType: dados.forma, value: valor, nextDueDate: dados.vencimento, cycle: "MONTHLY",
        description: String(dados.descricao ?? "Mensalidade Agência Vulpes"), externalReference: ref || undefined,
      });
      return json({ ok: true, assinatura: { id: s.id, cliente: s.customer, valor: s.value, proximoVencimento: s.nextDueDate, forma: s.billingType, status: s.status, referencia: s.externalReference } });
    }
    if (acao === "ajustar_vencimentos") {
      // Verificação diária: cobranças PENDENTES dos próximos dias que caem em sábado, domingo ou feriado
      // (ou fora da regra do cliente, como o 5º dia útil) passam para a data certa.
      // Só mexe na data; nunca em valor, forma ou status. simular: true só mostra o que faria.
      const simular = dados.simular === true;
      const janela = Math.min(Math.max(Number(dados.dias) || 60, 1), 90);
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      const { data: cfg } = await sb.from("settings").select("data").eq("id", "main").maybeSingle();
      const bancarios = cfg?.data?.bankDays !== false;
      const { data: clis } = await sb.from("clients").select("data");
      const porAssinatura = new Map<string, any>();
      for (const r of clis ?? []) if (r.data?.asaasSubscriptionId) porAssinatura.set(r.data.asaasSubscriptionId, r.data);
      const hoje = hojeBrasil();
      const ate = somaDias(hoje, janela);
      const pend = await listarTodos(`/payments?status=PENDING&dueDate[ge]=${hoje}&dueDate[le]=${ate}`);
      const resultado: any[] = [];
      for (const p of pend) {
        const cli = p.subscription ? porAssinatura.get(p.subscription) : null;
        let alvo: string;
        if (cli) {
          // Regra do cliente no mês da cobrança e no anterior (caso já tenha virado o mês); fica a mais próxima.
          const y = Number(p.dueDate.slice(0, 4)), m = Number(p.dueDate.slice(5, 7));
          const ant = m === 1 ? [y - 1, 12] : [y, m - 1];
          const cands = [vencimentoDoMes(cli, y, m, bancarios), vencimentoDoMes(cli, ant[0], ant[1], bancarios)];
          alvo = cands.sort((a, b) => Math.abs(diasEntre(p.dueDate, a)) - Math.abs(diasEntre(p.dueDate, b)))[0];
        } else {
          alvo = proximoDiaUtil(p.dueDate, bancarios);
        }
        if (alvo === p.dueDate) continue;
        const item: any = { cobranca: p.id, cliente: cli?.name ?? p.customer, de: p.dueDate, para: alvo };
        if (alvo <= hoje) { item.pulada = "nova data já passou ou é hoje"; resultado.push(item); continue; }
        if (Math.abs(diasEntre(p.dueDate, alvo)) > 12) { item.pulada = "diferença grande demais, conferir à mão"; resultado.push(item); continue; }
        if (!simular) {
          const atual = await asaasGet("/payments/" + p.id);
          if (atual.status !== "PENDING") { item.pulada = "status " + atual.status; resultado.push(item); continue; }
          await asaasPost("/payments/" + p.id, { billingType: atual.billingType, value: atual.value, dueDate: alvo });
          item.alterada = true;
        }
        resultado.push(item);
      }
      const log = { hoje, ate, simular, conferidas: pend.length, mudancas: resultado };
      if (!simular) await sb.from("integracao_config").upsert({ chave: "asaas_ultimo_ajuste", valor: JSON.stringify(log) });
      return json({ ok: true, ...log });
    }
    return json({ erro: "ação desconhecida", acoes: ["listar_clientes", "listar_assinaturas", "listar_cobrancas", "ver_personalizacao", "listar_notificacoes", "configurar_notificacoes", "valor_assinatura", "vencimento_assinatura", "vencimento_cobranca", "descricao_assinatura", "atualizar_cliente", "notificacoes_cliente", "criar_assinatura", "ajustar_vencimentos"] }, 400);
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e) }, 502);
  }
});
