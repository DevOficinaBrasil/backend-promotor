-- Migration: Adiciona coluna FILTRO_SEGMENTACAO em CAMPANHA_PROMOTOR
-- DSL JSON de segmentação CRM aplicada antes do cálculo de raio

ALTER TABLE "CAMPANHAS_OB"."CAMPANHA_PROMOTOR"
  ADD COLUMN IF NOT EXISTS "FILTRO_SEGMENTACAO" JSONB DEFAULT NULL;

COMMENT ON COLUMN "CAMPANHAS_OB"."CAMPANHA_PROMOTOR"."FILTRO_SEGMENTACAO"
  IS 'DSL JSON de segmentação CRM aplicada antes do cálculo de raio. Formato @obcrm/segmentation SegmentDynamicDsl.';
