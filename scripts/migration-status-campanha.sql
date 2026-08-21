-- Status de publicação da campanha.
--
-- Antes desta coluna, criar a campanha já a tornava ativa para o promotor: o
-- botão "Publicar" do wizard era decorativo. Agora a campanha nasce RASCUNHO e
-- só aparece em /campanha/ativa depois de publicada.
--
-- Backfill: tudo que já existe está no ar hoje, então entra como PUBLICADA —
-- marcar como rascunho esconderia campanhas em andamento dos promotores.

ALTER TABLE "CAMPANHAS_OB"."CAMPANHA"
  ADD COLUMN IF NOT EXISTS "STATUS" VARCHAR(20) NOT NULL DEFAULT 'RASCUNHO';

UPDATE "CAMPANHAS_OB"."CAMPANHA"
  SET "STATUS" = 'PUBLICADA'
  WHERE "STATUS" = 'RASCUNHO'
    AND "CREATED_AT" < NOW();

ALTER TABLE "CAMPANHAS_OB"."CAMPANHA"
  DROP CONSTRAINT IF EXISTS chk_campanha_status;

ALTER TABLE "CAMPANHAS_OB"."CAMPANHA"
  ADD CONSTRAINT chk_campanha_status
  CHECK ("STATUS" IN ('RASCUNHO', 'PUBLICADA'));

-- A busca da campanha ativa do promotor filtra por STATUS a cada requisição.
CREATE INDEX IF NOT EXISTS idx_campanha_status
  ON "CAMPANHAS_OB"."CAMPANHA" ("STATUS")
  WHERE "DELETED_AT" IS NULL;
