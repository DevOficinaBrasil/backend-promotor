-- Base de Oficinas da Ultracar nos Promotores (CON26-408)
-- Atributo "também é Ultracar" em MAIN_REGISTER.OFICINA.
-- Aplicar manualmente (sem runner de migration TypeORM neste repositório).

ALTER TABLE "MAIN_REGISTER"."OFICINA"
  ADD COLUMN IF NOT EXISTS "ULTRACAR" boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_oficina_ultracar
  ON "MAIN_REGISTER"."OFICINA" ("ULTRACAR")
  WHERE "ULTRACAR" = true;
