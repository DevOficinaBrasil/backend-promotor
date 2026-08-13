-- ============================================================================
-- Migration: Outbox de agendamento da Notificação de Visita
-- Data: 2026-08-13
--
-- Adiciona as colunas de fila na NOTIFICACAO_VISITA, que já existe em produção.
-- Este arquivo É caminho de ALTER, ao contrário do migration-notificacao-visita
-- (primeira execução). A decisão de 2026-08-07 ("sem caminho de ALTER") valia
-- enquanto a tabela não existia no destino, e está superseded em .specs/project/
-- STATE.md na entrada de 2026-08-13.
--
-- Semântica das colunas espelha CRM.integration_outbox do backend-communities,
-- para que a migração futura ao sistema de entrega compartilhado seja um
-- mapeamento coluna a coluna. Tipo de LOCKED_BY diverge de propósito: o alvo usa
-- VARCHAR(120), aqui é TEXT porque dba-rules proíbe VARCHAR nesta base.
--
-- Idempotente: IF NOT EXISTS em toda coluna e índice. Rodar duas vezes é no-op.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS "CAMPANHAS_OB"."IDX_NOTIFICACAO_VISITA_FILA"
--   ALTER TABLE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
--     DROP COLUMN IF EXISTS "AVAILABLE_AT",
--     DROP COLUMN IF EXISTS "LOCKED_AT",
--     DROP COLUMN IF EXISTS "LOCKED_BY",
--     DROP COLUMN IF EXISTS "ATTEMPTS"
-- (nenhum dado de notificação é perdido: as 4 colunas são só estado de fila)
--
-- REGRA DE EDIÇÃO: nenhum statement deste arquivo contém linha em branco ou
-- comentário no meio, e nenhum comentário contém ponto e vírgula. Não é estilo.
-- Clientes SQL dividem o script em statements por linha em branco e por ponto e
-- vírgula, sem entender comentário, e mandam ao servidor statement cortado pela
-- metade, que falha com "syntax error at end of input". Toda explicação fica
-- FORA do statement.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Colunas de fila
--
-- Notas mantidas aqui fora para o statement ficar sem comentário no meio:
--
--   AVAILABLE_AT   Quando a notificação fica elegível para envio. NULL é
--                  deliberado e carrega significado: linha criada ANTES desta
--                  migration, já despachada inline pelo fluxo antigo. A query
--                  de claim exige AVAILABLE_AT IS NOT NULL justamente para que
--                  o primeiro deploy do worker não reenvie o histórico.
--   LOCKED_AT      Início do lease do worker. Expiração é comparada na query
--                  (LOCKED_AT < now() - interval), não gravada aqui, igual ao
--                  alvo. Worker morto libera a linha sozinho quando o lease
--                  vence.
--   LOCKED_BY      Qual worker detém o lease (outbox-visita-<pid>). Serve para
--                  responder "qual cópia do servidor pegou esta linha", que é
--                  o dado que falta quando o servidor é copiado.
--   ATTEMPTS       Tentativas de envio. Incrementado no MESMO statement do
--                  claim, não no fim do despacho: processo morto no meio ainda
--                  queima tentativa, e linha que derruba o worker se aposenta
--                  no teto em vez de repetir para sempre.
-- ---------------------------------------------------------------------------
ALTER TABLE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
  ADD COLUMN IF NOT EXISTS "AVAILABLE_AT" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "LOCKED_AT" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "LOCKED_BY" TEXT,
  ADD COLUMN IF NOT EXISTS "ATTEMPTS" INT NOT NULL DEFAULT 0;


-- ---------------------------------------------------------------------------
-- 2. Comentários
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."AVAILABLE_AT" IS
  'Quando a notificacao fica elegivel para envio. NULL = linha anterior ao outbox, nunca reivindicada pelo worker. Equivale a CRM.integration_outbox.available_at';

COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."LOCKED_AT" IS
  'Inicio do lease do worker. Vencimento comparado na query de claim contra OUTBOX_VISITA_LOCK_LEASE_MINUTES. Equivale a CRM.integration_outbox.locked_at';

COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."LOCKED_BY" IS
  'Worker que detem o lease, no formato outbox-visita-<pid> ou outbox-visita-cli-<pid>. TEXT em vez do VARCHAR(120) do alvo por dba-rules. Equivale a CRM.integration_outbox.locked_by';

COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."ATTEMPTS" IS
  'Tentativas de envio, incrementado no claim. Teto em OUTBOX_VISITA_MAX_ATTEMPTS, depois a linha vira FALHOU. Equivale a CRM.integration_outbox.attempts';


-- ---------------------------------------------------------------------------
-- 3. Índice da fila
--
-- Parcial de propósito: só linha PENDENTE com AVAILABLE_AT é reivindicável, e a
-- fila é uma fatia pequena de uma tabela que guarda toda notificação já enviada.
-- Espelha idx_integration_outbox_status_available_at do alvo.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "IDX_NOTIFICACAO_VISITA_FILA"
  ON "CAMPANHAS_OB"."NOTIFICACAO_VISITA" ("AVAILABLE_AT")
  WHERE "STATUS" = 'PENDENTE' AND "AVAILABLE_AT" IS NOT NULL;
