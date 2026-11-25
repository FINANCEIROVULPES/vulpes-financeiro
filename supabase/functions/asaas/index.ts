// Função "asaas": ponte entre o Vulpes Financeiro e a API do Asaas.
// - A chave do Asaas fica só no secret ASAAS_API_KEY (nunca no código, no site ou no GitHub).
// - Toda chamada precisa do header x-vulpes-token igual ao valor guardado em public.integracao_config,
//   tabela que ninguém lê pela API (RLS sem regras); só esta função, com a service role.
// - Lê clientes e assinaturas. Única escrita: atualizar nome/celular/e-mail de um cliente já existente.
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
    return json({ erro: "ação desconhecida", acoes: ["listar_clientes", "listar_assinaturas", "atualizar_cliente"] }, 400);
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e) }, 502);
  }
});
