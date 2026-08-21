/**
 * Servidor de teste do WhatsApp — substitui `wpp.oficinabrasil.com.br` local.
 *
 *   npm run whatsapp:mock
 *
 * Implementa `POST /api/v1/messages/send-template` com o mesmo contrato que
 * `channels/whatsappChannel.ts` consome: Bearer no header, corpo
 * `{ accountId, toPhone, templateName, templateLanguage, variables }`, resposta
 * `{ success: true, messageId, providerMessageId }`.
 *
 * Cada envio é impresso com as 3 variáveis do template
 * `atualizacao_dados_visita_oficina` separadas ({{1}} nome do destinatário,
 * {{2}} empresa da campanha, {{3}} link de confirmação), que é o motivo de o
 * servidor existir: ver o link sem disparar mensagem real.
 *
 * Para simular falha do provider, mande o header `x-mock-fail` (ou a query
 * `?fail=`) com um dos códigos que o canal mapeia — TOKEN_INVALID,
 * TEMPLATE_NOT_FOUND, RATE_LIMITED, QUOTA_EXCEEDED, VALIDATION_ERROR:
 *
 *   curl -X POST 'http://localhost:4000/api/v1/messages/send-template?fail=RATE_LIMITED' \
 *     -H 'Authorization: Bearer fake' -H 'Content-Type: application/json' \
 *     -d '{"accountId":"1","toPhone":"5511999998888","templateName":"t","variables":[]}'
 *
 * O canal só chega até aqui com `WHATSAPP_SEND_ENABLED=true`, `NODE_ENV`
 * diferente de `test` e de `development`, e `WHATSAPP_BASE_URL` apontando para
 * este host — as três travas de `whatsappChannel.ts` continuam valendo.
 */
import express from "express";

const PORT = parseInt(process.env.WHATSAPP_MOCK_PORT || "4000");

/** Códigos que o canal trata como falha de configuração — respondem 401/404. */
const CODIGOS_CONFIGURACAO = new Set([
  "TOKEN_MISSING",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "ACCOUNT_DENIED",
  "SCOPE_DENIED",
  "ACCOUNT_NOT_FOUND",
  "TEMPLATE_NOT_FOUND",
]);

function statusDoCodigo(codigo: string): number {
  if (CODIGOS_CONFIGURACAO.has(codigo)) return 401;
  if (codigo === "RATE_LIMITED" || codigo === "QUOTA_EXCEEDED") return 429;
  if (codigo === "VALIDATION_ERROR") return 422;
  return 500;
}

const app = express();
app.use(express.json());

app.post("/api/v1/messages/send-template", (req, res) => {
  const { accountId, toPhone, templateName, templateLanguage, variables } = req.body ?? {};

  const forcado = (req.header("x-mock-fail") || req.query.fail) as string | undefined;
  if (forcado) {
    console.log(`\n❌ falha forçada: ${forcado}`);
    return res.status(statusDoCodigo(forcado)).json({ error: { code: forcado } });
  }

  const auth = req.header("authorization");
  if (!auth?.startsWith("Bearer ")) {
    console.log("\n❌ recusado: sem Bearer token");
    return res.status(401).json({ error: { code: "TOKEN_MISSING" } });
  }

  if (!accountId || !toPhone || !templateName || !Array.isArray(variables)) {
    console.log("\n❌ recusado: corpo inválido", req.body);
    return res.status(422).json({ error: { code: "VALIDATION_ERROR" } });
  }

  const messageId = `mock-${Date.now()}`;
  const [nome, empresa, link] = variables;

  console.log(`
📱 ENVIO ACEITO  ${new Date().toISOString()}
   para .......... ${toPhone}
   accountId ..... ${accountId}
   template ...... ${templateName} (${templateLanguage ?? "-"})
   {{1}} nome .... ${nome ?? "(vazio)"}
   {{2}} empresa . ${empresa ?? "(vazio)"}
   {{3}} link .... ${link ?? "(vazio)"}
   messageId ..... ${messageId}`);

  return res.json({
    success: true,
    messageId,
    providerMessageId: `wamid.MOCK${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
  });
});

app.get("/ping", (_req, res) => res.json({ message: "pong" }));

app.listen(PORT, () => {
  console.log(`WhatsApp mock em http://localhost:${PORT}`);
  console.log(`POST /api/v1/messages/send-template — aguardando envios...`);
});
