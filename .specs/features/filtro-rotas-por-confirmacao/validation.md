# Filtro de Rotas por Status de Confirmação — Validation

**Date**: 2026-08-18
**Spec**: `.specs/features/filtro-rotas-por-confirmacao/spec.md`
**Verifier**: passagem independente pós-implementação (fallback standalone do skill — nenhum sub-agente foi despachado, por instrução da sessão de não usar a AgentTool sem pedido). O autor e o verificador são o mesmo agente; isso é uma limitação real deste relatório e está declarada, não escondida.
**Diff range**: `ad1e4b7~3..ad1e4b7` (`4550eec`, `686cada`, `ad1e4b7`) em `merge/visit-notification+auto-assign`
**Result**: ✅ **PASS** com 1 mutante equivalente sobrevivente (AC8, não observável nesta camada — ver Ranked Gaps)

## Spec-Anchored Acceptance Criteria

Evidence-or-zero: cada célula coberta cita `file:line` e reproduz a asserção.

### P1: Promotor só vê oficinas cuja confirmação está resolvida

| AC | Outcome da spec | `file:line` + asserção | Resultado |
| --- | --- | --- | --- |
| AC1 — `BACKLOG` + `CONFIRMADO`/`DISPENSADO`/`FALHOU` entra na lista | rota presente | `__tests__/unit/statusNotificacaoVisita.test.ts:103` — `expect(rotaListavelParaPromotor(backlogCom(status), AGORA)).toBe(true)` para os 3 estados; serviço: `__tests__/unit/campanhaServiceVisita.test.ts:114` — `expect(resultado!.rotas.map(r => r.ID_ROTA_PROMOTOR)).toEqual([1, 2, 3])` | ✅ PASS |
| AC2 — `BACKLOG` + `PENDENTE`/`ENVIADO`/`EXPIRADO` sai da lista | rota ausente | `statusNotificacaoVisita.test.ts:109` (`PENDENTE`, `ENVIADO` → `toBe(false)`), `:116` (`ENVIADO` vencido), `:125` (`EXPIRADO` gravado); serviço: `campanhaServiceVisita.test.ts:94` — `expect(resultado!.rotas).toEqual([])` | ✅ PASS |
| AC3 — `REAGENDADO` ou valor fora do enum sai da lista | rota ausente | `statusNotificacaoVisita.test.ts:132` (`REAGENDADO` → `toBe(false)`), `:138` (`'INVENTADO'` → `toBe(false)`); serviço: `campanhaServiceVisita.test.ts:144` — `expect(resultado!.rotas).toEqual([])` | ✅ PASS |
| AC4 — rota `A CAMINHO`/`EM ANDAMENTO`/`FINALIZADO`/`CANCELADO` entra sempre | rota presente, qualquer notificação | `statusNotificacaoVisita.test.ts:153` — `toBe(true)` para os 4 status com notificação `ENVIADO`; serviço: `campanhaServiceVisita.test.ts:164` — `expect(resultado!.rotas.map(r => r.ID_ROTA_PROMOTOR)).toEqual([1, 2, 3])` com `ENVIADO`/`PENDENTE`/`ENVIADO` vencido | ✅ PASS |
| AC5 — rota sem linha em `NOTIFICACAO_VISITA` entra | rota presente, sem o campo | `statusNotificacaoVisita.test.ts:166` — `toBe(true)` para `notificacao` ausente e `null`; serviço: `campanhaServiceVisita.test.ts:225` — `expect(resultado!.rotas.map(r => r.ID_ROTA_PROMOTOR)).toEqual([1])` + `expect(rotas[0].notificacaoVisita).toBeUndefined()` | ✅ PASS |
| AC6 — mesmos campos e mesma ordem para as rotas incluídas | ordem e payload intactos | ordem: `campanhaServiceVisita.test.ts:114` e `:164` asserem a sequência de ids; payload: `:275` — `expect(rotas[0].oficina).toMatchObject({ LATITUDE: '-22.9099', LONGITUDE: '-47.0626', ENDERECO: 'Chacara do Ze' })` | ✅ PASS |
| AC7 — tudo filtrado → `200` com `rotas: []`, nunca `404` | campanha presente, lista vazia | `campanhaServiceVisita.test.ts:189` — `expect(resultado).not.toBeNull()`, `expect(resultado!.ID_CAMPANHA).toBe(1)`, `expect(resultado!.rotas).toEqual([])` | ✅ PASS (camada de serviço; o `404` é do controller, sem suíte no repo) |
| AC8 — decidir pelo status efetivo, não pelo bruto | `statusEfetivo()` na decisão | `statusNotificacaoVisita.test.ts:116` — `ENVIADO` + `EXPIRA_EM` passado → `toBe(false)`. **Não discrimina:** com a allowlist atual, bruto e efetivo dão o mesmo resultado (mutante 7) | ⚠️ Mutante equivalente |
| AC9 — mesmo número de consultas, nenhuma por rota | 1 consulta de rota | `campanhaServiceVisita.test.ts:240` — `expect(AppDataSourceSync.query as jest.Mock).toHaveBeenCalledTimes(1)` | ✅ PASS |

### P1: O dashboard do cliente não muda

| AC | Outcome da spec | `file:line` + asserção | Resultado |
| --- | --- | --- | --- |
| AC1 — `GET /campanha/:id` devolve todas as rotas | nenhuma rota filtrada | `campanhaServiceVisita.test.ts:311` — `expect(rotas.map(r => r.ID_ROTA_PROMOTOR)).toEqual([1, 2, 3])` com `PENDENTE`/`ENVIADO` vencido/`CONFIRMADO`, e `expect(rotas.map(r => r.notificacaoVisita!.STATUS)).toEqual([PENDENTE, EXPIRADO, CONFIRMADO])` | ✅ PASS |
| AC2 — `GET /campanha/client/:clientId` devolve todas as rotas | nenhuma rota filtrada | `campanhaServiceVisita.test.ts:514` — `expect(rotas.map(r => r.ID_ROTA_PROMOTOR)).toEqual([1, 2, 3, 4])` com `PENDENTE`/`ENVIADO` vencido/`REAGENDADO`/`CONFIRMADO` | ✅ PASS |
| AC3 — filtro só no caminho de `getActiveCampanhaByPromotor` | código inalcançável pelas outras duas | provado por mutação, não por asserção direta: mutantes 6 e 8 (vazamento do filtro para cada consulta do dashboard) foram mortos | ✅ PASS |

**Status**: 12 ACs — **11 ✅ cobertos com asserção**, **1 ⚠️ mutante equivalente** (AC8).

## Edge Cases

| Edge case | Evidência | Resultado |
| --- | --- | --- |
| Rota do banco legado (consulta join-free, sem coluna de notificação) entra | `statusNotificacaoVisita.test.ts:166` (mesmo caminho do `notificacao` ausente) + serviço `:225` | ✅ |
| Campanha ativa sem nenhuma rota responde como hoje | `campanhaService.test.ts:148-175` (suíte pré-existente, 2 testes, segue verde) | ✅ |
| `ENVIADO` com `EXPIRA_EM` nulo permanece `ENVIADO` e sai da lista | `statusNotificacaoVisita.test.ts:109` (`ENVIADO` com `EXPIRA_EM` futuro) e `:174` (`EXPIRA_EM` futuro, sem `STATUS` de rota) | ✅ |
| `CONFIRMADO` sem `CONFIRMADO_EM`/`EXPIRA_EM` entra | `statusNotificacaoVisita.test.ts:193` — `backlogCom(CONFIRMADO, null)` → `toBe(true)` | ✅ |
| Rota escondida que passa a `CONFIRMADO` aparece na chamada seguinte | sem teste dedicado: é consequência direta de AC1 sobre função pura sem estado. Registrado como não coberto, não como coberto | ❌ Sem teste |
| `STATUS` de rota nulo conta como `BACKLOG` | `statusNotificacaoVisita.test.ts:174` — `STATUS` ausente + `ENVIADO` → `toBe(false)`; `STATUS: null` + `CONFIRMADO` → `toBe(true)` | ✅ |

## Discrimination Sensor

Isolamento: `git worktree add` descartável em `$CLAUDE_JOB_DIR/tmp/sensor-bp`, `node_modules` por symlink, dois arquivos untracked (`utils/ipCliente.ts`, `utils/sqlCadastroEmpresa.ts`) copiados porque não estão em `HEAD` — sem eles a suíte do serviço não roda. `git worktree remove --force` no fim. `git status --porcelain` da árvore real conferido idêntico ao baseline (227 linhas, `diff` vazio). Nenhum `git stash`.

Controle sem mutação: **47 testes passam** (25 do predicado + 22 do serviço).

| # | Arquivo | Mutação | Resultado |
| --- | --- | --- | --- |
| 1 | `utils/statusNotificacaoVisita.ts:45-49` | `PENDENTE` adicionado à allowlist | ✅ **Killed** — 3 falhas |
| 2 | `utils/statusNotificacaoVisita.ts:45-49` | `FALHOU` removido da allowlist | ✅ **Killed** — 3 falhas |
| 3 | `utils/statusNotificacaoVisita.ts:78` | `if (statusRota !== StatusRota.BACKLOG)` → `if (false)`: rota já trabalhada perde o passe livre | ✅ **Killed** — 5 falhas |
| 4 | `utils/statusNotificacaoVisita.ts:82-84` | rota sem notificação passa a ser escondida (`return false`) | ✅ **Killed** — 4 falhas |
| 5 | `service/campanhaService.ts:310` | `rotasVisiveis` → `rotasPromotor` no map: filtro calculado e ignorado (silent-drop) | ✅ **Killed** — 4 falhas |
| 6 | `service/campanhaService.ts:498` | filtro aplicado também na consulta por cliente (vazamento para a visão gerencial) | ✅ **Killed** — 2 falhas, uma delas o teste de regressão FILT-08 |
| 7 | `utils/statusNotificacaoVisita.ts:86` | `statusEfetivo(rota.notificacao, agora)` → `rota.notificacao.STATUS`: decide pelo status bruto | ❌ **SURVIVED** — 47/47 passam |
| 8 | `service/campanhaService.ts:389` | filtro aplicado em `getCampanhaByIdWithRelations` (vazamento para distribuição/ordenação) | ✅ **Killed** — 2 falhas |
| 9 | `service/campanhaService.ts:310` | ordem da lista invertida | ✅ **Killed** — 3 falhas |

**Sensor result**: **8/9 killed.** O sobrevivente é **mutante equivalente, não lacuna de teste**: `ENVIADO` e `EXPIRADO` estão os dois fora da allowlist, então trocar efetivo por bruto não muda saída nenhuma — nenhum teste possível mata essa mutação com a allowlist atual. `statusEfetivo()` fica na decisão porque a equivalência é acidente da allowlist de hoje: se algum dia `EXPIRADO` virar listável e `ENVIADO` não, o bruto passaria a errar.

## Gate Check

| Comando | Resultado |
| --- | --- |
| `npx jest __tests__/unit/statusNotificacaoVisita.test.ts` | 25 testes, 0 falhas (baseline 9 → **+16**) |
| `npx jest __tests__/unit/campanhaServiceVisita.test.ts` | 22 testes, 0 falhas (baseline 17 → **+5**, 3 reescritos) |
| `npm run test:unit` | **33 suítes / 554 testes, 0 falhas**; 2 suítes não rodam (ver abaixo). Baseline pré-feature: 532 testes → **+22** |
| `npx tsc --noEmit` | limpo, exceto `service/segmentacaoService.ts` (pré-existente) |
| `npx jest __tests__/unit/campanhaService.test.ts __tests__/unit/rotaServiceVisita.test.ts` | 30 testes, 0 falhas — suítes vizinhas do mesmo serviço sem regressão |

### Quebra pré-existente, não regressão

`__tests__/unit/segmentacaoService.test.ts` e `segmentedOficinas.test.ts` não rodam: `TS2307: Cannot find module '@obcrm/segmentation'`. A dependência (`package.json:30`, `^0.3.0`) entrou no merge de `origin/merge/visit-notification+auto-assign` e não está instalada nesta máquina. Independe desta feature; `npm install` destrava.

## Test Adequacy

| Princípio | Status |
| --- | --- |
| Código mínimo: um predicado puro + um `filter` | ✅ 2 arquivos de produção |
| Sem scope creep — nada no `ob-ads`, nada no `frontend-promotor` | ✅ |
| Testes derivam das ACs, não da implementação | ✅ cada `it` cita o FILT/AC |
| Nenhuma asserção enfraquecida, apagada ou marcada como skip | ✅ 3 testes reescritos por decisão explícita do usuário, todos com asserção mais forte (igualdade de lista) do que a anterior |
| Segue padrões do projeto (helper puro ao lado de `statusEfetivo`, SCREAMING_SNAKE na API) | ✅ |
| Diretrizes de teste do repo (`.specs/codebase/TESTING.md`) | ✅ `__tests__/unit/<subject>.test.ts`, data-source mockado |

## Requirement Traceability

| Requirement | Status | Base |
| --- | --- | --- |
| FILT-01 | ✅ Verified | `statusNotificacaoVisita.test.ts:103`; `campanhaServiceVisita.test.ts:114` |
| FILT-02 | ✅ Verified | `statusNotificacaoVisita.test.ts:109,116,125`; `campanhaServiceVisita.test.ts:94` |
| FILT-03 | ✅ Verified | `statusNotificacaoVisita.test.ts:132,138`; `campanhaServiceVisita.test.ts:144` |
| FILT-04 | ✅ Verified | `statusNotificacaoVisita.test.ts:153`; `campanhaServiceVisita.test.ts:164` |
| FILT-05 | ✅ Verified | `statusNotificacaoVisita.test.ts:166`; `campanhaServiceVisita.test.ts:225` |
| FILT-06 | ✅ Verified | `campanhaServiceVisita.test.ts:189,275`; mutante 9 |
| FILT-07 | ✅ Verified | `campanhaServiceVisita.test.ts:240` |
| FILT-08 | ✅ Verified | `campanhaServiceVisita.test.ts:311,514`; mutantes 6 e 8 |

## Ranked Gaps

1. **[Minor] AC8 não é observável nesta camada.** O mutante 7 (bruto em vez de efetivo) sobrevive porque `ENVIADO` e `EXPIRADO` estão ambos fora da allowlist. Não é teste faltando: é AC redundante com AC2 dada a decisão de esconder os dois. Fica como risco declarado para o dia em que a allowlist mudar.
2. **[Minor] Edge case "rota escondida que passa a CONFIRMADO aparece na chamada seguinte" não tem teste.** É consequência direta de AC1 sobre função pura sem cache, coberta indiretamente por `statusNotificacaoVisita.test.ts:103`. Registrado como não coberto por honestidade.
3. **[Informativo] AC7 é verificada na camada de serviço, não no HTTP.** O `200` vem do controller, que não tem suíte neste repo (`.specs/codebase/TESTING.md` lista controllers como não testados). O teste prova que o serviço devolve a campanha com `rotas: []` em vez de `null`, que é o que decidiria entre `200` e `404`.
4. **[Informativo] Autor = verificador.** O skill pede sub-agente independente; a instrução da sessão proíbe despachar AgentTool sem pedido. A separação autor/verificador não existe neste relatório.

## Summary

**Overall**: ✅ **Ready**

O filtro está em `rotaListavelParaPromotor` (`utils/statusNotificacaoVisita.ts:73`) e aplicado uma vez, em `getActiveCampanhaByPromotor` (`service/campanhaService.ts:262`), antes do enriquecimento das rotas legadas. Nenhuma consulta nova. As duas consultas do `ob-ads` continuam devolvendo tudo, e isso é testado nas duas direções: asserção de lista completa e mutação de vazamento morta em cada uma.

**Sensor**: 9 mutações, 8 mortas, 1 equivalente.
**Gate**: 554 testes unitários verdes (+22), `tsc` limpo, 2 suítes bloqueadas por dependência ausente pré-existente.
