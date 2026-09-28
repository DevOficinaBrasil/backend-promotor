-- ============================================================================
-- Migration: Convite de visita pelo admin (aceite, recusa, importadas)
-- Data: 2026-09-28
-- Feature: .specs/features/disparo-convite-visita-admin (CONV-35, CONV-44,
-- CONV-45, CONV-46)
--
-- Caminho de ALTER sobre NOTIFICACAO_VISITA, que já existe em produção.
-- Aplicar manualmente, na ordem do arquivo. O agente não aplica este script.
--
-- O que faz:
--   1. Colunas novas: ORIGEM_ACEITE, ID_NOTIFICACAO_REFERENCIA, RECUSADO_EM,
--      RECUSADO_POR, RECUSADO_IP, TELEFONE_ORIGEM.
--   2. CHK de STATUS com AGUARDANDO e RECUSADO.
--   3. CHKs de domínio de ORIGEM_ACEITE e TELEFONE_ORIGEM.
--   4. Backfill 1: CONFIRMADO existente vira ORIGEM_ACEITE = REPARADOR.
--   5. Backfill 2: notificação ainda não aceita nem recusada de rota de oficina
--      importada para o slug da campanha vira CONFIRMADO / IMPORTADA.
--   6. Backfill 3: rota de oficina importada sem notificação ganha uma linha
--      CONFIRMADO / IMPORTADA.
--   7. CHKs de consistência que dependem dos backfills.
--   8. Índice parcial das AGUARDANDO por referência.
--
-- Impacto dos UPDATE/INSERT (dba-rules regra 6, conferir antes de aplicar):
--   Backfill 1 toca toda linha CONFIRMADO com ORIGEM_ACEITE nulo. Só grava a
--   origem, não muda STATUS.
--   Backfill 2 muda STATUS para CONFIRMADO de linhas PENDENTE, ENVIADO, FALHOU,
--   DISPENSADO, EXPIRADO ou REAGENDADO de rota viva cuja oficina tem
--   OFICINA_IMPORTADA ativa no EMPRESA_SLUG da campanha. Essas rotas passam a
--   aparecer para o promotor. Linhas CONFIRMADO e RECUSADO não mudam.
--   Backfill 3 insere uma linha por rota viva de oficina importada sem
--   notificação. Nenhuma mensagem é enviada: a linha não tem AVAILABLE_AT.
--   Prévia do impacto (rodar antes):
--     SELECT nv."STATUS", count(*) FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv
--     JOIN "CAMPANHAS_OB"."ROTA_PROMOTOR" rp ON rp."ID_ROTA_PROMOTOR" = nv."ID_ROTA_PROMOTOR"
--     JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp ON cp."ID_CAMPANHA_PROMOTOR" = rp."ID_CAMPANHA_PROMOTOR"
--     JOIN "CAMPANHAS_OB"."CAMPANHA" c ON c."ID_CAMPANHA" = cp."ID_CAMPANHA"
--     JOIN "CAMPANHAS_OB"."OFICINA_IMPORTADA" oi ON oi."ID_OFICINA" = rp."ID_OFICINA"
--       AND oi."EMPRESA_SLUG" = c."EMPRESA_SLUG" AND oi."DELETED_AT" IS NULL
--     WHERE rp."DELETED_AT" IS NULL GROUP BY nv."STATUS"
--
-- Idempotente: IF NOT EXISTS em coluna e índice, DROP CONSTRAINT IF EXISTS +
-- ADD no mesmo ALTER, e todo backfill filtra o que já foi feito. Rodar duas
-- vezes é no-op.
--
-- ROLLBACK (na ordem):
--   UPDATE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
--     SET "STATUS" = 'PENDENTE', "AVAILABLE_AT" = now()
--     WHERE "STATUS" = 'AGUARDANDO'
--   UPDATE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
--     SET "STATUS" = 'DISPENSADO', "ERRO_ENVIO" = 'recusado pelo reparador'
--     WHERE "STATUS" = 'RECUSADO'
--   DROP INDEX IF EXISTS "CAMPANHAS_OB"."IDX_NOTIFICACAO_VISITA_AGUARDANDO_REF"
--   ALTER TABLE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
--     DROP CONSTRAINT IF EXISTS "CHK_NOTIFICACAO_VISITA_RECUSADO_EM",
--     DROP CONSTRAINT IF EXISTS "CHK_NOTIFICACAO_VISITA_CONFIRMADO_ORIGEM",
--     DROP CONSTRAINT IF EXISTS "CHK_NOTIFICACAO_VISITA_AGUARDANDO_REF",
--     DROP CONSTRAINT IF EXISTS "CHK_NOTIFICACAO_VISITA_ORIGEM_ACEITE",
--     DROP CONSTRAINT IF EXISTS "CHK_NOTIFICACAO_VISITA_TELEFONE_ORIGEM",
--     DROP CONSTRAINT IF EXISTS "CHK_NOTIFICACAO_VISITA_STATUS",
--     ADD CONSTRAINT "CHK_NOTIFICACAO_VISITA_STATUS"
--       CHECK ("STATUS" IN ('PENDENTE', 'ENVIADO', 'CONFIRMADO', 'FALHOU', 'DISPENSADO', 'EXPIRADO', 'REAGENDADO'))
--   ALTER TABLE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
--     DROP COLUMN IF EXISTS "ORIGEM_ACEITE",
--     DROP COLUMN IF EXISTS "ID_NOTIFICACAO_REFERENCIA",
--     DROP COLUMN IF EXISTS "RECUSADO_EM",
--     DROP COLUMN IF EXISTS "RECUSADO_POR",
--     DROP COLUMN IF EXISTS "RECUSADO_IP",
--     DROP COLUMN IF EXISTS "TELEFONE_ORIGEM"
-- Limite do rollback: as linhas que os backfills 2 e 3 levaram a CONFIRMADO
-- continuam CONFIRMADO. O status anterior não é guardado. Para desfazer o
-- backfill 3, apague as linhas com ORIGEM_ACEITE = 'IMPORTADA' e TOKEN_HASH
-- nulo ANTES do DROP COLUMN.
--
-- REGRA DE EDIÇÃO: nenhum statement deste arquivo contém linha em branco ou
-- comentário no meio, e nenhum comentário contém ponto e vírgula. Não é estilo.
-- Clientes SQL dividem o script em statements por linha em branco e por ponto e
-- vírgula, sem entender comentário, e mandam ao servidor statement cortado pela
-- metade, que falha com "syntax error at end of input". Toda explicação fica
-- FORA do statement.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Colunas novas
--
-- Notas mantidas aqui fora para o statement ficar sem comentário no meio:
--
--   ORIGEM_ACEITE              Por que a linha está CONFIRMADO: REPARADOR,
--                              CONFIRMACAO_RECENTE, CONVITE_VINCULADO ou
--                              IMPORTADA. "Aceito" continua sendo um status só.
--   ID_NOTIFICACAO_REFERENCIA  Notificação cujo desfecho esta segue (AGUARDANDO)
--                              ou que justificou o aceite automático
--                              (CONFIRMACAO_RECENTE, CONVITE_VINCULADO). SEM FK:
--                              o design pedia REFERENCES, mas o padrão da casa
--                              (dba-rules regra 8, ID_ROTA_PROMOTOR desta mesma
--                              tabela) é relacionamento implícito, e FK em
--                              tabela de produção exige aprovação explícita. A
--                              integridade fica com a aplicação, como no resto
--                              da tabela.
--   RECUSADO_EM/POR/IP         Espelham CONFIRMADO_EM/POR/IP para a recusa.
--                              RECUSADO_POR é o sub do JWT de visita.
--   TELEFONE_ORIGEM            Fonte do número usado no envio. Nulo em linha
--                              anterior a esta migration e em linha sem envio.
-- ---------------------------------------------------------------------------
ALTER TABLE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
  ADD COLUMN IF NOT EXISTS "ORIGEM_ACEITE" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "ID_NOTIFICACAO_REFERENCIA" INT NULL,
  ADD COLUMN IF NOT EXISTS "RECUSADO_EM" TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS "RECUSADO_POR" INT NULL,
  ADD COLUMN IF NOT EXISTS "RECUSADO_IP" TEXT NULL,
  ADD COLUMN IF NOT EXISTS "TELEFONE_ORIGEM" TEXT NULL;


-- ---------------------------------------------------------------------------
-- 2. CHK de STATUS com os estados novos
--
-- AGUARDANDO = segue o desfecho de outro convite ENVIADO em aberto da mesma
-- oficina. RECUSADO = o reparador recusou pelo link. DROP + ADD no mesmo
-- ALTER, então a tabela nunca fica sem o CHK.
-- ---------------------------------------------------------------------------
ALTER TABLE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
  DROP CONSTRAINT IF EXISTS "CHK_NOTIFICACAO_VISITA_STATUS",
  ADD CONSTRAINT "CHK_NOTIFICACAO_VISITA_STATUS"
    CHECK ("STATUS" IN ('PENDENTE', 'ENVIADO', 'CONFIRMADO', 'FALHOU', 'DISPENSADO', 'EXPIRADO', 'REAGENDADO', 'AGUARDANDO', 'RECUSADO'));


-- ---------------------------------------------------------------------------
-- 3. Domínio das colunas de origem (nulo permitido)
-- ---------------------------------------------------------------------------
ALTER TABLE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
  DROP CONSTRAINT IF EXISTS "CHK_NOTIFICACAO_VISITA_ORIGEM_ACEITE",
  ADD CONSTRAINT "CHK_NOTIFICACAO_VISITA_ORIGEM_ACEITE"
    CHECK ("ORIGEM_ACEITE" IS NULL OR "ORIGEM_ACEITE" IN ('REPARADOR', 'CONFIRMACAO_RECENTE', 'CONVITE_VINCULADO', 'IMPORTADA')),
  DROP CONSTRAINT IF EXISTS "CHK_NOTIFICACAO_VISITA_TELEFONE_ORIGEM",
  ADD CONSTRAINT "CHK_NOTIFICACAO_VISITA_TELEFONE_ORIGEM"
    CHECK ("TELEFONE_ORIGEM" IS NULL OR "TELEFONE_ORIGEM" IN ('USUARIO_CELULAR', 'USUARIO_TELEFONE', 'OFICINA_TELEFONE', 'CADASTRO_EMPRESA_TELEFONE'));


-- ---------------------------------------------------------------------------
-- 4. Backfill 1: todo CONFIRMADO anterior a esta feature veio do reparador
--
-- Roda antes do CHK que exige ORIGEM_ACEITE em CONFIRMADO (seção 7).
-- ---------------------------------------------------------------------------
UPDATE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
   SET "ORIGEM_ACEITE" = 'REPARADOR'
 WHERE "STATUS" = 'CONFIRMADO'
   AND "ORIGEM_ACEITE" IS NULL;


-- ---------------------------------------------------------------------------
-- 5. Backfill 2 (CONV-46): notificação de oficina importada vira aceita
--
-- Só rota viva (ROTA_PROMOTOR.DELETED_AT nulo) cuja oficina tem linha ativa em
-- OFICINA_IMPORTADA no EMPRESA_SLUG da campanha da rota. CONFIRMADO e RECUSADO
-- ficam como estão. Limpa as colunas de fila para o worker não reivindicar a
-- linha. TOKEN_HASH e EXPIRA_EM ficam como estão, o que mantém o CHK de par.
-- ---------------------------------------------------------------------------
UPDATE "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv
   SET "STATUS" = 'CONFIRMADO',
       "ORIGEM_ACEITE" = 'IMPORTADA',
       "CONFIRMADO_EM" = now(),
       "AVAILABLE_AT" = NULL,
       "LOCKED_AT" = NULL,
       "LOCKED_BY" = NULL,
       "ID_NOTIFICACAO_REFERENCIA" = NULL,
       "UPDATED_AT" = now()
  FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
  JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp ON cp."ID_CAMPANHA_PROMOTOR" = rp."ID_CAMPANHA_PROMOTOR"
  JOIN "CAMPANHAS_OB"."CAMPANHA" c ON c."ID_CAMPANHA" = cp."ID_CAMPANHA"
 WHERE rp."ID_ROTA_PROMOTOR" = nv."ID_ROTA_PROMOTOR"
   AND rp."DELETED_AT" IS NULL
   AND nv."STATUS" NOT IN ('CONFIRMADO', 'RECUSADO')
   AND EXISTS (
     SELECT 1
       FROM "CAMPANHAS_OB"."OFICINA_IMPORTADA" oi
      WHERE oi."ID_OFICINA" = rp."ID_OFICINA"
        AND oi."EMPRESA_SLUG" = c."EMPRESA_SLUG"
        AND oi."DELETED_AT" IS NULL
   );


-- ---------------------------------------------------------------------------
-- 6. Backfill 3 (CONV-46): rota de oficina importada sem notificação
--
-- Mesmo critério do backfill 2. Linha nasce CONFIRMADO / IMPORTADA, sem token
-- (satisfaz o CHK de par) e sem AVAILABLE_AT (o worker nunca a reivindica).
-- CANAL = WHATSAPP é o default da coluna, que é NOT NULL. Nada é enviado.
-- ON CONFLICT cobre execução concorrente com a aplicação criando a linha.
-- ---------------------------------------------------------------------------
INSERT INTO "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
  ("ID_ROTA_PROMOTOR", "CANAL", "STATUS", "ORIGEM_ACEITE", "CONFIRMADO_EM")
SELECT rp."ID_ROTA_PROMOTOR", 'WHATSAPP', 'CONFIRMADO', 'IMPORTADA', now()
  FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" rp
  JOIN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR" cp ON cp."ID_CAMPANHA_PROMOTOR" = rp."ID_CAMPANHA_PROMOTOR"
  JOIN "CAMPANHAS_OB"."CAMPANHA" c ON c."ID_CAMPANHA" = cp."ID_CAMPANHA"
 WHERE rp."DELETED_AT" IS NULL
   AND NOT EXISTS (
     SELECT 1
       FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv
      WHERE nv."ID_ROTA_PROMOTOR" = rp."ID_ROTA_PROMOTOR"
   )
   AND EXISTS (
     SELECT 1
       FROM "CAMPANHAS_OB"."OFICINA_IMPORTADA" oi
      WHERE oi."ID_OFICINA" = rp."ID_OFICINA"
        AND oi."EMPRESA_SLUG" = c."EMPRESA_SLUG"
        AND oi."DELETED_AT" IS NULL
   )
ON CONFLICT ("ID_ROTA_PROMOTOR") DO NOTHING;


-- ---------------------------------------------------------------------------
-- 7. CHKs de consistência (depois dos backfills)
--
--   RECUSADO_EM         Gravado no mesmo UPDATE que seta RECUSADO, igual a
--                       CONFIRMADO_EM.
--   CONFIRMADO_ORIGEM   Todo aceite diz de onde veio. Depende do backfill 1.
--   AGUARDANDO_REF      Linha aguardando sem referência nunca seria liberada.
-- ---------------------------------------------------------------------------
ALTER TABLE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
  DROP CONSTRAINT IF EXISTS "CHK_NOTIFICACAO_VISITA_RECUSADO_EM",
  ADD CONSTRAINT "CHK_NOTIFICACAO_VISITA_RECUSADO_EM"
    CHECK ("STATUS" <> 'RECUSADO' OR "RECUSADO_EM" IS NOT NULL),
  DROP CONSTRAINT IF EXISTS "CHK_NOTIFICACAO_VISITA_CONFIRMADO_ORIGEM",
  ADD CONSTRAINT "CHK_NOTIFICACAO_VISITA_CONFIRMADO_ORIGEM"
    CHECK ("STATUS" <> 'CONFIRMADO' OR "ORIGEM_ACEITE" IS NOT NULL),
  DROP CONSTRAINT IF EXISTS "CHK_NOTIFICACAO_VISITA_AGUARDANDO_REF",
  ADD CONSTRAINT "CHK_NOTIFICACAO_VISITA_AGUARDANDO_REF"
    CHECK ("STATUS" <> 'AGUARDANDO' OR "ID_NOTIFICACAO_REFERENCIA" IS NOT NULL);


-- ---------------------------------------------------------------------------
-- 8. Índice das AGUARDANDO por referência
--
-- Parcial: serve a propagação em transicionar (WHERE referência = id AND
-- STATUS = AGUARDANDO) e a reconciliação do tick, que só olham AGUARDANDO.
-- As linhas aceitas com referência não precisam de índice.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "IDX_NOTIFICACAO_VISITA_AGUARDANDO_REF"
  ON "CAMPANHAS_OB"."NOTIFICACAO_VISITA" ("ID_NOTIFICACAO_REFERENCIA")
  WHERE "STATUS" = 'AGUARDANDO';


-- ---------------------------------------------------------------------------
-- 9. Comentários
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."STATUS" IS
  'Estado do fluxo: PENDENTE, ENVIADO, CONFIRMADO (aceito, origem em ORIGEM_ACEITE), FALHOU, DISPENSADO (envio suprimido de propósito, não é falha), EXPIRADO, REAGENDADO (reservado, sem code path), AGUARDANDO (segue o convite em ID_NOTIFICACAO_REFERENCIA), RECUSADO (reparador recusou pelo link).';

COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."ORIGEM_ACEITE" IS
  'Origem do aceite quando STATUS = CONFIRMADO: REPARADOR (link), CONFIRMACAO_RECENTE (destinatário confirmou há menos de 3 meses), CONVITE_VINCULADO (seguiu o convite de referência), IMPORTADA (oficina em OFICINA_IMPORTADA para o slug da campanha). Obrigatória em CONFIRMADO.';

COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."ID_NOTIFICACAO_REFERENCIA" IS
  'Notificação de referência: o convite ENVIADO que uma linha AGUARDANDO segue, ou o aceite que justificou CONFIRMACAO_RECENTE/CONVITE_VINCULADO. Relacionamento implícito com esta mesma tabela (sem FK, padrão da casa e dba-rules regra 8). Integridade garantida pela aplicação.';

COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."RECUSADO_EM" IS
  'Timestamp (com fuso) da recusa. Gravado no mesmo UPDATE que seta STATUS = RECUSADO.';

COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."RECUSADO_POR" IS
  'ID do usuário reparador que recusou, vindo do claim sub do JWT de visita. Relacionamento implícito com MAIN_REGISTER.USUARIO (schema read-only).';

COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."RECUSADO_IP" IS
  'IP de origem da recusa (TEXT, sem limite para não restringir IPv6).';

COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."TELEFONE_ORIGEM" IS
  'Fonte do número usado no envio: USUARIO_CELULAR, USUARIO_TELEFONE, OFICINA_TELEFONE ou CADASTRO_EMPRESA_TELEFONE (dw.cadastro_empresa.telefone). Nulo em linha anterior a esta migration ou sem envio.';
