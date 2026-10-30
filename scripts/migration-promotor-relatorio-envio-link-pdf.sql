-- ============================================================================
-- Migration: Link do PDF arquivado no S3 (relatório semanal de promotores)
-- Data: 2026-10-30 | CON26-325
--
-- Pressupõe que a tabela CAMPANHAS_OB.PROMOTOR_RELATORIO_ENVIO já existe
-- (scripts/migration-promotor-relatorio-envio.sql). O IF NOT EXISTS é rede de
-- segurança contra execução dupla, não caminho de atualização.
--
-- ROLLBACK:
--   ALTER TABLE "CAMPANHAS_OB"."PROMOTOR_RELATORIO_ENVIO" DROP COLUMN IF EXISTS "LINK_PDF"
--
-- REGRA DE EDIÇÃO: nenhum statement deste arquivo contém linha em branco ou
-- comentário no meio, e nenhum comentário contém ponto e vírgula. Toda
-- explicação fica FORA do statement.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Coluna
--
-- LINK_PDF: URL pública do PDF arquivado no S3 (RELPROM-45). Nulo quando o
-- envio foi em modo preview (enviarEmail=false, RELPROM-48) ou quando o
-- upload pro S3 falhou (RELPROM-46) — nunca bloqueia o envio do e-mail.
-- ---------------------------------------------------------------------------
ALTER TABLE "CAMPANHAS_OB"."PROMOTOR_RELATORIO_ENVIO" ADD COLUMN IF NOT EXISTS "LINK_PDF" TEXT


-- ---------------------------------------------------------------------------
-- 2. Documentação no catálogo
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN "CAMPANHAS_OB"."PROMOTOR_RELATORIO_ENVIO"."LINK_PDF" IS
  'URL pública do PDF arquivado no S3. Nulo em modo preview (enviarEmail=false) ou quando o upload falhou — nunca bloqueia o envio do relatório.'
