// Função "asaas": ponte entre o Vulpes Financeiro e a API do Asaas.
// - A chave do Asaas fica só no secret ASAAS_API_KEY (nunca no código, no site ou no GitHub).
// - Toda chamada precisa do header x-vulpes-token igual ao valor guardado em public.integracao_config,
//   tabela que ninguém lê pela API (RLS sem regras); só esta função, com a service role.
// - Lê clientes e assinaturas; atualiza contato e notificações de clientes; cria assinaturas mensais.
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
          id: c.id, nome: c.name, cpfCnpj: c.cpfCnpj, email: c.email, celular: c.mobilePhone,
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
      // Só nome, celular e e-mail; nada financeiro.
      const id = String(dados.id ?? "");
      if (!/^cus_[A-Za-z0-9]+$/.test(id)) return json({ erro: "id de cliente inválido" }, 400);
      const atual = await asaasGet("/customers/" + id);
      const patch: Record<string, string> = { name: dados.nome ?? atual.name };
      if (dados.celular !== undefined) patch.mobilePhone = String(dados.celular).replace(/\D/g, "");
      if (dados.email !== undefined) patch.email = String(dados.email);
      const c = await asaasPost("/customers/" + id, patch);
      return json({ ok: true, cliente: { id: c.id, nome: c.name, celular: c.mobilePhone, email: c.email } });
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
    return json({ erro: "ação desconhecida", acoes: ["listar_clientes", "listar_assinaturas", "listar_cobrancas", "ver_personalizacao", "descricao_assinatura", "atualizar_cliente", "notificacoes_cliente", "criar_assinatura"] }, 400);
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e) }, 502);
  }
});
