-- ============================================================================
-- Migration: Origem de aceite FREELANCER (confirmação de dados por telefone)
-- Data: 2026-10-07
-- Feature: .specs/features/freela-confirmacao-dados
--
-- Aplicar manualmente, na ordem do arquivo. O agente não aplica este script.
--
-- O que faz:
--   1. Garante a coluna NOTIFICACAO_VISITA.ORIGEM_ACEITE (TEXT, nula).
--   2. Recria CHK_NOTIFICACAO_VISITA_ORIGEM_ACEITE aceitando também
--      'FREELANCER', além dos cinco valores já existentes.
--   3. Comentário da coluna atualizado com o valor novo.
--
-- Pré-requisito: nenhum obrigatório. O passo 1 é IF NOT EXISTS, então este
-- script roda antes ou depois de scripts/migration-convite-visita-admin.sql
-- (feature disparo-convite-visita-admin), que também cria a coluna.
--
-- ATENÇÃO: migration-convite-visita-admin.sql recria a MESMA CHK, só com os
-- cinco valores antigos. Se ela rodar DEPOIS deste script, 'FREELANCER' sai da
-- CHK e a confirmação do freelancer passa a falhar com 23514. Antes de aplicar
-- a outra, inclua 'FREELANCER' na CHK dela (seção 3) ou reaplique este script.
--
-- Sem UPDATE/DELETE de dados: nenhuma linha existente é tocada. A CHK nova é um
-- superconjunto da antiga, então todas as linhas atuais continuam válidas.
-- Sem tabela nova, sem FK (dba-rules regras 1, 2, 7 e 8 não se aplicam).
-- Sem índice novo: ORIGEM_ACEITE nunca é filtro de leitura.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS e DROP CONSTRAINT IF EXISTS + ADD no
-- mesmo ALTER. Rodar duas vezes é no-op.
--
-- ROLLBACK (na ordem; rode a prévia antes):
--   Prévia: SELECT count(*) FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
--           WHERE "ORIGEM_ACEITE" = 'FREELANCER'
--   Se a prévia der mais de zero, essas linhas violam a CHK antiga. Decida o
--   destino delas antes (por exemplo UPDATE para 'REPARADOR'). Não é feito
--   automaticamente porque perde a informação de quem confirmou.
--   ALTER TABLE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
--     DROP CONSTRAINT IF EXISTS "CHK_NOTIFICACAO_VISITA_ORIGEM_ACEITE",
--     ADD CONSTRAINT "CHK_NOTIFICACAO_VISITA_ORIGEM_ACEITE"
--       CHECK ("ORIGEM_ACEITE" IS NULL OR "ORIGEM_ACEITE" IN ('REPARADOR', 'CONFIRMACAO_RECENTE', 'CONVITE_VINCULADO', 'IMPORTADA', 'ENDERECO_RECENTE'))
--   A coluna ORIGEM_ACEITE em si pertence a migration-convite-visita-admin.sql,
--   não a esta: o rollback acima NÃO a remove.
--
-- REGRA DE EDIÇÃO: nenhum statement deste arquivo contém linha em branco ou
-- comentário no meio, e nenhum comentário contém ponto e vírgula. Clientes SQL
-- dividem o script por linha em branco e por ponto e vírgula, sem entender
-- comentário. Toda explicação fica FORA do statement.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Coluna (no-op quando a migration do convite admin já rodou)
-- ---------------------------------------------------------------------------
ALTER TABLE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
  ADD COLUMN IF NOT EXISTS "ORIGEM_ACEITE" TEXT NULL;


-- ---------------------------------------------------------------------------
-- 2. CHK de domínio com FREELANCER (nulo permitido)
--
-- DROP + ADD no mesmo ALTER, então a tabela nunca fica sem a CHK.
-- ---------------------------------------------------------------------------
ALTER TABLE "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
  DROP CONSTRAINT IF EXISTS "CHK_NOTIFICACAO_VISITA_ORIGEM_ACEITE",
  ADD CONSTRAINT "CHK_NOTIFICACAO_VISITA_ORIGEM_ACEITE"
    CHECK ("ORIGEM_ACEITE" IS NULL OR "ORIGEM_ACEITE" IN ('REPARADOR', 'CONFIRMACAO_RECENTE', 'CONVITE_VINCULADO', 'IMPORTADA', 'ENDERECO_RECENTE', 'FREELANCER'));


-- ---------------------------------------------------------------------------
-- 3. Comentário
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."ORIGEM_ACEITE" IS
  'Origem do aceite quando STATUS = CONFIRMADO: REPARADOR (link), CONFIRMACAO_RECENTE (destinatário confirmou há menos de 3 meses), CONVITE_VINCULADO (seguiu o convite de referência), IMPORTADA (oficina em OFICINA_IMPORTADA para o slug da campanha), ENDERECO_RECENTE (OFICINA.DATA_ATUALIZACAO_ENDERECO com menos de 3 meses), FREELANCER (confirmação de dados por telefone feita por freelancer no painel; CONFIRMADO_POR = ID_USUARIO do freelancer).';

COMMIT;
