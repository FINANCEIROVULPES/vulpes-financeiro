# Vulpes Financeiro

Sistema interno da Agência Vulpes para clientes, mensalidades, jobs (serviços adicionais com parcelas), despesas (contas a pagar), calendário de vencimentos e cobranças pelo WhatsApp.

Identidade visual tirada de vulpesag.com.br: laranja #E05A1C / #B84A16, preto #0D0D0D / #161616, creme #F4EFE6, fontes Barlow e Barlow Condensed e o logotipo oficial (versão branca).

## Como usar

- **Versão online (recomendada):** https://claude.ai/artifact/QoaukWJBbjnRd9nnY4NG2s
  Os dados ficam salvos na sua conta e aparecem em qualquer dispositivo. Só você tem acesso.
- **Versão offline:** abra `dist/vulpes-financeiro.html` no navegador. Nesse modo os dados ficam salvos só
  naquele navegador (nesta cópia do repositório ele começa vazio: os dados reais não são versionados). Use Configurações > Exportar/Importar backup para mover dados.

## Versão web (Vercel + Supabase)

- `dist/web/index.html` é gerado por `python3 build.py` e publicado pela Vercel (`vercel.json`).
- Login das sócias pelo Supabase Auth. Só os e-mails cadastrados em `privado.emails_autorizados` viram sócias
  (migração `003`); qualquer outro login não vê nenhum dado (regras RLS, migrações `001` e `002`).
- `js/config.js` tem a URL e a chave **pública** do Supabase. A chave secreta nunca vai para o código.
- Estrutura do banco: `supabase/migrations/` (rodar em ordem).

## Estrutura do código (`src/`)

| Arquivo | Função |
|---|---|
| `js/utils.js` | Formatação de moeda e datas, escape de HTML |
| `js/calendar-br.js` | Feriados nacionais, Páscoa e cálculo do 5º dia útil |
| `js/storage.js` | Camada de dados (armazenamento da conta ou do navegador) com a mesma interface |
| `js/messaging.js` | Modelos de mensagem e canais de WhatsApp (manual hoje, Business API preparada) |
| `js/store.js` | Regras de negócio: geração mensal, status, histórico, configurações |
| `js/jobs.js` | Jobs: parcelas, andamento financeiro e lista unificada de cobranças (mensalidades + parcelas) |
| `js/expenses.js` | Despesas: cadastro, geração mensal sem duplicar, parcelas, status, resumo e relatório |
| `js/brand.js` | Logotipos oficiais embutidos |
| `js/ui.js` | Ícones, modais, avisos |
| `js/view-*.js` | Telas: painel, clientes, pagamentos, cobranças, calendário, configurações |
| `js/app.js` | Navegação, filtros e ações |

Para gerar os arquivos de `dist/` após mudanças: `python3 build.py`.

## Regras importantes

- Mensalidades são geradas uma vez por cliente/mês (do mês de início até o próximo mês) e nunca são sobrescritas.
  Editar um cliente só altera as mensalidades em aberto a partir do mês atual.
- "Aguardando pagamento" vencido aparece automaticamente como "Em atraso".
- 5º dia útil: sem sábados, domingos e feriados nacionais. Por padrão também ignora Carnaval e Corpus Christi
  (sem expediente bancário); dá para desligar em Configurações.
- Nada é enviado automaticamente. "Marcar como enviada" só libera depois de copiar o texto ou abrir o WhatsApp.

- Jobs: padrão 50% no aceite + 50% na segunda etapa, editável (quantidade, %, valor, nome, condição, vencimento e forma por parcela).
  Só entra como recebido a parcela marcada como paga. Clientes "só jobs" não geram mensalidades.

- Despesas: fixas, assinaturas e parcelas geram um lançamento por mês (`<despesa>_<AAAA-MM>`), do mês de início até o próximo mês,
  sem duplicar. A parcela avança sozinha e para na última (quitada não gera mais nada). Assinaturas podem ser canceladas e fixas encerradas
  escolhendo o último mês; o histórico fica. Gastos variáveis e compras eventuais são lançamentos avulsos, sem limite.
  Despesas sem data de vencimento ficam "Pendente" sem virar atraso, até a data ser informada.
- Painel: **Saldo do mês** = mensalidades recebidas + jobs recebidos − despesas pagas no mês (pela data do pagamento).
  **Resultado previsto** = mensalidades previstas + parcelas de jobs que vencem no mês − despesas previstas do mês.

- Rateio entre sócias: cada lançamento tem "quem pagou" (Karol ou Natasha), obrigatório ao adicionar e editável depois
  (no cadastro vale do mês atual em diante; na lista de contas vale só para aquele mês). Fechamento de cada mês:
  soma do que cada uma pagou, total ÷ 2, e quem pagou menos transfere a diferença. Acerto no dia 20 do próprio mês.
  Contas ainda não marcadas como pagas entram pelo valor previsto; contas sem responsável ficam fora até serem definidas.
  O acerto registrado (coleção `settlements`, id AAAA-MM) é só transferência entre as sócias: não é despesa e não entra
  no saldo nem no resultado do painel. O histórico mostra todos os meses e o saldo pendente acumulado.

## WhatsApp Business API (futuro)

Em `js/messaging.js`, `channels.api` já tem o formato `send({ to, text, confirmedByUser })`. Para ativar, implemente
`transport` chamando um servidor seu (que guarda o token da Meta). O envio recusa qualquer chamada sem `confirmedByUser: true`.
