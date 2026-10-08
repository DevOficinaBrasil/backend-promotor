-- ============================================================================
-- Migration: status de rota AGUARDANDO (rota estacionada no promotor)
-- Data: 2026-10-08
--
-- Aplicar manualmente. A ordem com o deploy é livre: o código compara
-- "STATUS"::text com 'AGUARDANDO' (comparar o enum direto com um valor que ele
-- ainda não tem dá 22P02 e derrubaria as listas). Só gravar 'AGUARDANDO' exige
-- a migration aplicada.
--
-- O que faz:
--   1. Acrescenta 'AGUARDANDO' ao enum "CAMPANHAS_OB".status_rota.
--   2. Documenta o valor no COMMENT da coluna ROTA_PROMOTOR.STATUS.
--
-- Semântica: a rota pertence ao promotor (continua reservando a oficina na
-- exclusividade da campanha), mas o sistema a ignora — não aparece nem conta no
-- app do promotor, no dashboard do cliente (ob-ads) nem no relatório, e a
-- notificação de visita não é despachada enquanto a rota estiver parada. Serve
-- para acumular rotas antes de liberá-las (UPDATE para BACKLOG).
--
-- Não confundir com NOTIFICACAO_VISITA.STATUS = 'AGUARDANDO' (notificação que
-- segue um convite já enviado): são colunas e enums diferentes.
--
-- Sem UPDATE/DELETE de dados: nenhuma linha existente é tocada.
-- Sem tabela nova, sem FK, sem índice novo (STATUS já é filtrado junto com
-- ID_CAMPANHA_PROMOTOR, que é a chave seletiva).
--
-- Idempotente: ADD VALUE IF NOT EXISTS (PostgreSQL >= 9.3). Rodar duas vezes é
-- no-op. ALTER TYPE ... ADD VALUE não pode rodar dentro de um bloco de
-- transação junto com um uso do valor novo; rode este script sozinho.
--
-- ROLLBACK:
--   PostgreSQL não remove valor de enum. O rollback é operacional:
--   Prévia:  SELECT count(*) FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" WHERE "STATUS" = 'AGUARDANDO';
--   Liberar: UPDATE "CAMPANHAS_OB"."ROTA_PROMOTOR" SET "STATUS" = 'BACKLOG'
--            WHERE "STATUS" = 'AGUARDANDO';   -- (confirme antes: dba-rules regra 6)
--   Com zero linhas no valor, o código anterior volta a funcionar sem mudança;
--   o valor fica no enum sem uso. Remover de vez exige recriar o tipo
--   (CREATE TYPE novo, ALTER COLUMN ... TYPE ... USING, DROP TYPE antigo), com
--   lock na tabela — só se for realmente necessário.
-- ============================================================================

ALTER TYPE "CAMPANHAS_OB".status_rota ADD VALUE IF NOT EXISTS 'AGUARDANDO';

COMMENT ON COLUMN "CAMPANHAS_OB"."ROTA_PROMOTOR"."STATUS" IS
  'Estado da visita: BACKLOG (a fazer), A CAMINHO, EM ANDAMENTO, FINALIZADO, CANCELADO, AGUARDANDO (rota estacionada: reserva a oficina para o promotor, mas é ignorada pelo app do promotor, pelo dashboard do cliente, pelo relatório e pelo despacho de notificação até voltar para BACKLOG).';
