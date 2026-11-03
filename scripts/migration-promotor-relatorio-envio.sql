-- ============================================================================
-- Migration: Controle de envio do relatório semanal de promotores
-- Data: 2026-10-29 | CON26-325
-- Atualizado: 2026-10-30 — tabela movida em produção pro schema DATA_INSIGHT
-- (era CAMPANHAS_OB). Este script roda contra o ambiente dev, que ainda não
-- tem a tabela — replica o schema novo usado em produção.
--
-- Pressupõe que a tabela ainda NÃO existe no ambiente alvo. O IF NOT EXISTS é
-- rede de segurança contra execução dupla, não caminho de atualização: se a
-- tabela já existir, o script vira no-op e o schema precisa ser conferido à
-- mão.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO" CASCADE
-- (remove tabela, índices e a sequence do SERIAL — não remove o schema
-- "DATA_INSIGHT" em si, que pode ter outras tabelas)
--
-- REGRA DE EDIÇÃO: nenhum statement deste arquivo contém linha em branco ou
-- comentário no meio, e nenhum comentário contém ponto e vírgula. Toda
-- explicação fica FORA do statement.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Schema
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS "DATA_INSIGHT"


-- ---------------------------------------------------------------------------
-- 1. Tabela
--
-- Convenções dba-rules aplicadas: nunca VARCHAR (TEXT + CHECK), nunca
-- TIMESTAMP naive (TIMESTAMPTZ), sem FK (relacionamento implícito).
--
-- Notas do corpo do CREATE, mantidas aqui fora para o statement ficar sem
-- linha em branco e sem comentário no meio:
--
--   ID_CLIENTE        ID do cliente no SQL Server do backend-ob-ads (mesmo
--                     espaço de CAMPANHA.ID_CLIENT) — sem FK, schema
--                     diferente, acesso só via /internal/modulos/* do ob-ads.
--   ORIGEM            CRON (disparo agendado) ou MANUAL (endpoint de teste).
--   STATUS            SUCESSO ou FALHA do processamento daquele cliente.
--   MOTIVO_FALHA      Preenchido só quando STATUS = FALHA.
--   DESTINATARIOS     Lista de e-mails efetivamente usada no envio (admins
--                     reais em produção, ou a lista fixa de teste fora dela).
--   AMBIENTE          'production' ou 'nao-production' — registra em qual
--                     ambiente aquele envio rodou, pra auditoria.
--   LINK_PDF          URL pública do PDF arquivado no S3 (RELPROM-45). Nulo
--                     em modo preview (enviarEmail=false) ou quando o upload
--                     falhar — nunca bloqueia o envio do relatório.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO" (
  "ID" SERIAL PRIMARY KEY,
  "ID_CLIENTE" INT NOT NULL,
  "PERIODO_INICIO" TIMESTAMPTZ NOT NULL,
  "PERIODO_FIM" TIMESTAMPTZ NOT NULL,
  "ORIGEM" TEXT NOT NULL,
  "STATUS" TEXT NOT NULL,
  "MOTIVO_FALHA" TEXT,
  "DESTINATARIOS" JSONB,
  "AMBIENTE" TEXT NOT NULL,
  "LINK_PDF" TEXT,
  "CRIADO_EM" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CHK_PROMOTOR_RELATORIO_ENVIO_ORIGEM"
    CHECK ("ORIGEM" IN ('CRON', 'MANUAL')),
  CONSTRAINT "CHK_PROMOTOR_RELATORIO_ENVIO_STATUS"
    CHECK ("STATUS" IN ('SUCESSO', 'FALHA')),
  CONSTRAINT "CHK_PROMOTOR_RELATORIO_ENVIO_AMBIENTE"
    CHECK ("AMBIENTE" IN ('production', 'nao-production')),
  CONSTRAINT "CHK_PROMOTOR_RELATORIO_ENVIO_MOTIVO_FALHA"
    CHECK ("STATUS" <> 'FALHA' OR "MOTIVO_FALHA" IS NOT NULL)
);


-- ---------------------------------------------------------------------------
-- 2. Documentação no catálogo
-- ---------------------------------------------------------------------------
COMMENT ON TABLE "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO" IS
  'Idempotência e auditoria do relatório semanal de promotores (CON26-325). 1 linha por cliente processado em cada execução (agendada ou manual).';

COMMENT ON COLUMN "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO"."ID" IS
  'PK artificial.';
COMMENT ON COLUMN "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO"."ID_CLIENTE" IS
  'ID do cliente no SQL Server do backend-ob-ads (mesmo espaço de CAMPANHA.ID_CLIENT). Sem FK, schema diferente.';
COMMENT ON COLUMN "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO"."PERIODO_INICIO" IS
  'Início da janela de dados coberta por este relatório (TIMESTAMPTZ, inclusive).';
COMMENT ON COLUMN "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO"."PERIODO_FIM" IS
  'Fim da janela de dados coberta por este relatório (TIMESTAMPTZ, inclusive).';
COMMENT ON COLUMN "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO"."ORIGEM" IS
  'CRON (disparo agendado semanal) ou MANUAL (endpoint de teste/preview). Só CRON+SUCESSO entra no índice único de idempotência.';
COMMENT ON COLUMN "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO"."STATUS" IS
  'SUCESSO ou FALHA do processamento deste cliente nesta execução.';
COMMENT ON COLUMN "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO"."MOTIVO_FALHA" IS
  'Motivo da falha (sem admin resolvido, erro do ob-ads, erro de geração de PDF, etc). NULL quando STATUS = SUCESSO.';
COMMENT ON COLUMN "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO"."DESTINATARIOS" IS
  'Lista JSON de e-mails efetivamente usada no envio — admins reais em produção, ou a lista fixa de teste (DEV_REPORT_RECIPIENTS) fora dela.';
COMMENT ON COLUMN "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO"."AMBIENTE" IS
  'Ambiente em que este envio rodou: production ou nao-production.';
COMMENT ON COLUMN "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO"."LINK_PDF" IS
  'URL pública do PDF arquivado no S3. Nulo em modo preview (enviarEmail=false) ou quando o upload falhou — nunca bloqueia o envio do relatório.';
COMMENT ON COLUMN "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO"."CRIADO_EM" IS
  'Data/hora de criação do registro (TIMESTAMPTZ).';


-- ---------------------------------------------------------------------------
-- 3. Índices
-- ---------------------------------------------------------------------------

-- Idempotência (RELPROM-18): impede 2 envios de sucesso do mesmo período pro
-- mesmo cliente via cron. Parcial pra não restringir MANUAL (endpoint de
-- teste pode repetir o mesmo período à vontade) nem tentativas que falharam.
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_PROMOTOR_RELATORIO_ENVIO_IDEMPOTENCIA"
  ON "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO" ("ID_CLIENTE", "PERIODO_INICIO", "PERIODO_FIM")
  WHERE "ORIGEM" = 'CRON' AND "STATUS" = 'SUCESSO';

-- Suporta o resumo da execução (RELPROM-19) e qualquer auditoria por cliente.
CREATE INDEX IF NOT EXISTS "IDX_PROMOTOR_RELATORIO_ENVIO_CLIENTE"
  ON "DATA_INSIGHT"."PROMOTOR_RELATORIO_ENVIO" ("ID_CLIENTE", "CRIADO_EM");
