-- Modo Definição de Rota — agenda de visitas por dia
-- Aplicar manualmente (sem runner de migration TypeORM neste repositório).
--
-- `DATA_VISITA` é o dia planejado de uma visita. Nulo significa "sem dia
-- definido", que é o estado de toda rota criada antes desta feature — e o que
-- garante que uma campanha já publicada continue se comportando como antes.
--
-- Com a coluna, `ORDEM` passa a significar a ordem DENTRO do dia. Para rota sem
-- `DATA_VISITA`, ela mantém o significado anterior: ordem dentro do vínculo.

ALTER TABLE "CAMPANHAS_OB"."ROTA_PROMOTOR"
  ADD COLUMN IF NOT EXISTS "DATA_VISITA" DATE NULL;

-- Busca das rotas de um promotor num dia: é o acesso do drawer de agenda e do
-- recorte de visibilidade do app de campo.
CREATE INDEX IF NOT EXISTS idx_rota_promotor_data_visita
  ON "CAMPANHAS_OB"."ROTA_PROMOTOR" ("ID_CAMPANHA_PROMOTOR", "DATA_VISITA")
  WHERE "DELETED_AT" IS NULL;

-- Duas visitas do mesmo promotor, no mesmo dia, não podem disputar a mesma
-- posição. Esta é a garantia no banco, não apenas uma convenção no código.
--
-- Atenção a quem for escrever ORDEM: índice parcial não vira constraint, e só
-- constraint aceita ser adiada até o fim da transação em Postgres. Por isso toda
-- escrita de ordem acontece em duas fases dentro de uma transação — zera a ordem
-- do recorte, depois grava 1..N. Atualizar linha a linha sem zerar antes colide
-- no meio do caminho.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rota_promotor_dia_ordem
  ON "CAMPANHAS_OB"."ROTA_PROMOTOR" ("ID_CAMPANHA_PROMOTOR", "DATA_VISITA", "ORDEM")
  WHERE "DELETED_AT" IS NULL AND "DATA_VISITA" IS NOT NULL;
