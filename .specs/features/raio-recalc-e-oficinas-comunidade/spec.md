# Recálculo de Rotas por RAIO + Listagem de Oficinas da Comunidade

> Feature irmã de `ob-ads/.specs/features/novo-fluxo-campanha-promotores/` (wizard "mapa como palco").
> Data: 2026-08-14

## Problem Statement

O novo wizard do ob-ads mostra a cobertura das oficinas da comunidade no mapa e permite ajustar o
raio de um vínculo já criado. Faltam dois endpoints: (1) listar TODAS as oficinas ativas da
comunidade (hoje só existe `community-nearby`, que exige centro+raio) para pintar as "sem
promotor"; (2) atualizar `CAMPANHA_PROMOTOR.RAIO` recalculando as rotas — hoje o RAIO só é usado
no momento do vínculo (marcado como "feature futura" na spec de auto-assign-rotas).

## Endpoints

### E1 — `GET /oficina/community-all?empresaSlug=X`
- Nova função `OficinaService.getCommunityOficinas(empresaSlug)`: mesma query de
  `getComunityNearbyOficinas` SEM o filtro Haversine (sem lat/long/raio) e sem `distance`.
- Mesmas colunas de retorno (`dw.cadastro_empresa`, `status_receita = 'ATIVA'`, lat/long NOT NULL).
- Response: `{ message, data: CommunityOficina[] }`.

### E2 — `PUT /promotor/campanha-promotor/:id/raio`
- Body: `{ RAIO: number (1..200), EMPRESA_SLUG: string }`.
- Fluxo:
  1. Carrega `CAMPANHA_PROMOTOR` (404 se não existe/deleted) + `PROMOTOR` (400 se sem lat/long).
  2. Atualiza `RAIO`.
  3. `getComunityNearbyOficinas(promotor.lat, promotor.long, novoRaio, slug)` → conjunto "dentro".
  4. **Adicionar**: oficinas "dentro" sem rota ativa NA CAMPANHA (qualquer promotor — exclusividade,
     mesma regra do auto-assign) → `createRotas` STATUS BACKLOG.
  5. **Remover**: rotas do vínculo com STATUS `BACKLOG` cuja oficina saiu do conjunto "dentro" → soft delete.
  6. Rotas com outros STATUS (A CAMINHO, EM ANDAMENTO, FINALIZADO, CANCELADO) nunca são tocadas.
- Response: `{ message, data: { ID_CAMPANHA_PROMOTOR, RAIO, adicionadas: number, removidas: number, total: number } }`.
- `total` = rotas ativas do vínculo após o recálculo.

## Regras de negócio
1. Exclusividade da campanha: uma oficina só tem 1 rota ativa por campanha.
2. Apenas BACKLOG é removível no recálculo.
3. Falha de geocoding/slug inválido → 400 com mensagem clara; nunca deixar o RAIO atualizado sem recálculo (transação).

## Arquivos
| Arquivo | Ação |
|---|---|
| `service/oficinaService.ts` | + `getCommunityOficinas` |
| `service/promotorService.ts` | + `updateCampanhaPromotorRaio` (reusa helpers de auto-assign) |
| `controllers/oficinaController.ts` | + handler `communityAll` |
| `controllers/promotorController.ts` | + handler `updateRaio` |
| `routes/OficinaRoute.ts` | + rota documentada |
| `routes/PromotorRoute.ts` | + rota documentada |
| `schemas/oficina.ts` / `schemas/promotor.ts` | + schemas Zod |
