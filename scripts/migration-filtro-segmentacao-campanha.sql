-- Filtro de segmentação no nível da CAMPANHA.
--
-- O filtro por vínculo (CAMPANHA_PROMOTOR.FILTRO_SEGMENTACAO) continua sendo a
-- fonte usada pelo auto-assign de rotas. Esta coluna guarda o filtro definido
-- uma vez na campanha, no passo de segmentação do wizard: ele recorta as
-- oficinas elegíveis da comunidade e é herdado por cada vínculo criado dali em
-- diante. Vínculo com filtro próprio continua prevalecendo sobre o da campanha.

ALTER TABLE "CAMPANHAS_OB"."CAMPANHA"
  ADD COLUMN IF NOT EXISTS "FILTRO_SEGMENTACAO" JSONB DEFAULT NULL;

COMMENT ON COLUMN "CAMPANHAS_OB"."CAMPANHA"."FILTRO_SEGMENTACAO"
  IS 'DSL JSON de segmentação CRM no nível da campanha (@obcrm/segmentation SegmentDynamicDsl). Herdada pelos vínculos CAMPANHA_PROMOTOR criados depois. NULL = sem segmentação, todas as oficinas da comunidade.';
