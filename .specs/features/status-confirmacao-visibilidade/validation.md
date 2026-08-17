# Visibilidade do Status de Confirmação de Visita — Validation

**Date**: 2026-08-17
**Spec**: `.specs/features/status-confirmacao-visibilidade/spec.md`
**Verifier**: independent sub-agent (author ≠ verifier), read-only over all three real trees
**Verdict**: ✅ **PASS** (with 2 by-design sensor survivors on the untested React-component layer — see Ranked Gaps)

## Diff range per repo

| Repo | Path | Branch | Range verified |
| --- | --- | --- | --- |
| backend-promotor | `/Users/augustodearrudakono/Documents/backend-promotor` | `merge/visit-notification+auto-assign` | `4f8a4c0..HEAD` (`a579018`..`4665fbf`) |
| ob-ads | `/Users/augustodearrudakono/Documents/ob-ads` | `feat/promotores-auto-atribuir` | given as `43e29b8..c9c7b96`; **corrected to `8a99701..c9c7b96`** — `43e29b8` *is* T5 (`types/vinculo.ts:60`), so the given range excluded the feature's first commit |
| frontend-promotor | `/Users/augustodearrudakono/Documents/frontend-promotor` | `feat/status-confirmacao-visibilidade` | `ab7d249..d180720` |

`backend-promotor`'s log carries `.specs/`-only status commits for T5–T16 (code for those tasks lives in the other two repos). Judged by code, not by those commits. `git diff --stat 4f8a4c0..HEAD` on backend-promotor touches only `spec.md`, `tasks.md` and 8 real code/test files.

---

## Spec-Anchored Acceptance Criteria

Evidence-or-zero. `❌ no test evidence` means no assertion exists — code location is cited separately where the behavior is implemented.

### P1: Operador vê o status de confirmação no dashboard (ob-ads)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 — rota `CONFIRMADO` na distribuição de rotas → indicador de confirmada distinto do pendente | mapa `CONFIRMADO → confirmada`, badge emerald/`CheckCircle2` distinto de amber/`Clock` | mapper: `ob-ads/lib/statusConfirmacao.test.ts:5` — `expect(mapStatusConfirmacao('CONFIRMADO')).toBe('confirmada')`; render: **no test** — código em `ob-ads/.../components/RotasDistributionSection.tsx:751` + `StatusConfirmacaoBadge.tsx:14-31` | ⚠️ Mapper coberto, render sem evidência de teste |
| AC2 — mesmo indicador na tela de ordenação de visitas | mesmo componente, mesmo mapa | mesmo mapper acima; render: **no test** — `ob-ads/.../components/RouteOrderingSection.tsx:499-501` (mesmo `StatusConfirmacaoBadge`) | ⚠️ Mapper coberto, render sem evidência de teste |
| AC3 — `EXPIRADO`/`FALHOU` → indicador distinto de confirmado e de pendente | terceiro estado `nao-recebe` | `ob-ads/lib/statusConfirmacao.test.ts:21` — `expect(mapStatusConfirmacao('EXPIRADO')).toBe('nao-recebe')`; `:25` — `expect(mapStatusConfirmacao('FALHOU')).toBe('nao-recebe')` | ✅ PASS |
| AC4 — `PENDENTE`/`ENVIADO`/`DISPENSADO` → indicador de pendente | os três colapsam em `pendente` | `ob-ads/lib/statusConfirmacao.test.ts:9,13,17` — `expect(mapStatusConfirmacao('PENDENTE'\|'ENVIADO'\|'DISPENSADO')).toBe('pendente')` | ✅ PASS |
| AC5 — sem `notificacaoVisita` → sem indicador, e NÃO como pendente | retorno `null`, badge não renderiza | `ob-ads/lib/statusConfirmacao.test.ts:33` — `expect(mapStatusConfirmacao(undefined)).toBeNull()`; `:37` (`null`); `:41` — `expect(mapStatusConfirmacao('RECUSADO')).toBeNull()`; guarda `StatusConfirmacaoBadge.tsx:44` — `if (!estado) return null` | ✅ PASS (mapper) |
| AC6 — dado vem do payload de `GET /campanha/:id` já carregado, sem chamada nova | zero requests adicionais | **no test evidence**; código: badge alimentado por `vinculo.rotasPromotor` (`RotasDistributionSection.tsx:563-570`) e `rota.notificacaoVisita` (`RouteOrderingSection.tsx:500`) — nenhum `fetch`/`useQuery` novo no diff | ⚠️ Sem evidência de teste (verificado por inspeção do diff) |

### P1: Promotor vê o status antes de sair a campo (frontend-promotor)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 — indicador por rota com estados distintos confirmada / pendente / expirada-falhou | mesmos três estados do ob-ads | `frontend-promotor/lib/statusConfirmacao.test.ts:5,9,13,17,21,25` — `expect(mapStatusConfirmacao('CONFIRMADO')).toBe('confirmada')` … `('FALHOU')).toBe('nao-recebe')`; render: **no test** — `components/route-carousel.tsx:49-66,155,179,207` | ⚠️ Mapper coberto (paridade 1:1 com ob-ads), render sem evidência de teste |
| AC2 — confirmada com `CONFIRMADO_EM` não nulo → exibe a data junto ao indicador | data exibida (formato não definido na spec) | **no test evidence**; código `route-carousel.tsx:53-56` — `estado === "confirmada" && rota.notificacao_visita?.confirmado_em ? formatarData(...)`. Preservação do dado até o modelo local: `service/campanha.service.test.ts:64` — `expect(rota.notificacao_visita).toEqual({ status: "CONFIRMADO", confirmado_em: "2026-02-10T12:00:00.000Z" })` | ⚠️ Spec-precision gap (formato da data não definido) + render sem teste |
| AC3 — `CONFIRMADO_EM` nulo com `STATUS = CONFIRMADO` → indicador sem data, sem renderizar `null` | rótulo puro, sem `null` nem data vazia | **no test evidence** no render; código `route-carousel.tsx:53-56` (`data` fica `null`) e `:60` (`{data ? \`${label} em ${data}\` : label}`). Camada de dados coberta: `service/campanha.service.test.ts:76` — `expect(rota.notificacao_visita).toEqual({ status: "PENDENTE", confirmado_em: null })` | ⚠️ Sem evidência de teste no render |
| AC4 — `GET /campanha/ativa` continua devolvendo `oficina` com `LATITUDE`/`LONGITUDE` (regressão do TRIM) | coordenadas intactas em toda rota | `__tests__/unit/campanhaServiceVisita.test.ts:181` — `expect(resultado!.rotas[0].oficina).toMatchObject({ LATITUDE: '-22.9099', LONGITUDE: '-47.0626', ENDERECO: 'Chacara do Ze' })` | ✅ PASS |
| AC5 — rota sem linha em `NOTIFICACAO_VISITA` renderiza normalmente, sem indicador | campo ausente → `null` do mapper | `frontend-promotor/lib/statusConfirmacao.test.ts:33,37` (`undefined`/`null` → `null`); `service/campanha.service.test.ts:85` — `expect("notificacao_visita" in rota).toBe(false)` | ✅ PASS |

### P1: O endereço corrigido chega a quem dirige até lá (backend-promotor)

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 — grava em `MAIN_REGISTER.OFICINA` **e** `dw.cadastro_empresa`, mesma oficina, uma transação | os dois updates dentro de `AppDataSourceSync.transaction` | `__tests__/unit/visitaConfirmacaoService.test.ts:738` — `expect(ordemDeChamadas).toEqual(["transacao:inicio","oficina","empresa","notificacao"])`; banco real: `__tests__/integration/visitaEndereco.test.ts:396` — `expect(oficina.ENDERECO).toBe("Avenida Teste VISIB Sete")` + `:400-401` — `expect(empresa.logradouro).toBe("Avenida")` / `expect(empresa.rua).toBe("Teste VISIB Sete")` | ✅ PASS |
| AC2 — falha em qualquer tabela reverte ambas, não confirma, responde `500` + `error: "ADDRESS_UPDATE_FAILED"` | rollback real + 500 com esse `error` | rollback real: `__tests__/integration/visitaEndereco.test.ts:453-455` — `expect(await lerOficina(...)).toEqual(antesOficina)`, `expect(await lerEmpresa(...)).toEqual(antesEmpresa)`, `expect(await statusDaNotificacao(...)).toBe("ENVIADO")`; unit: `__tests__/unit/visitaConfirmacaoService.test.ts:832` + `:857` — `expect(resultado).toEqual({ state: "ADDRESS_UPDATE_FAILED" })` / `expect(empresaRepo.update).not.toHaveBeenCalled()`; HTTP: `__tests__/integration/visitaEndereco.test.ts:164,167` — `expect(resposta.status).toBe(500)` + `error: "ADDRESS_UPDATE_FAILED"` | ✅ PASS |
| AC3 — primeiro token é tipo conhecido → token em `logradouro`, resto em `rua` | par exato `{logradouro: tipo, rua: nome}` | `__tests__/unit/logradouro.test.ts:11` — `expect(dividirLogradouro('Rua das Flores')).toEqual({ logradouro: 'Rua', rua: 'das Flores' })` (+ os 8 tipos, `:17-64`; `:79` case/acento-insensível; `:86` trim) | ✅ PASS |
| AC4 — token desconhecido → `logradouro = NULL` e string inteira em `rua` | `{logradouro: null, rua: <string original>}` | `__tests__/unit/logradouro.test.ts:96` — `expect(dividirLogradouro('Chacara do Ze')).toEqual({ logradouro: null, rua: 'Chacara do Ze' })`; ponta a ponta no service: `__tests__/unit/visitaConfirmacaoService.test.ts:783-784` — `expect(escrito.LOGRADOURO).toBeNull()` / `expect(escrito.ENDERECO).toBe("Chacara do Ze")` | ✅ PASS |
| AC5 — `NUMERO`, `COMPLEMENTO`, `BAIRRO`, `CIDADE`, `ESTADO`, `CEP` gravados sem transformação nas duas tabelas | mesmos valores nos dois destinos | `__tests__/unit/visitaConfirmacaoService.test.ts:752-767` — `expect(empresaRepo.update).toHaveBeenCalledWith({ ID_OFICINA }, { LOGRADOURO:"Avenida", ENDERECO:"Nova", NUMERO:"500", COMPLEMENTO:null, BAIRRO:"Centro", CIDADE:"Campinas", ESTADO:"SP", CEP:"13010-000" })`; banco real: `visitaEndereco.test.ts:402-407` — `expect(empresa.numero).toBe("1500")` … `expect(empresa.cep).toBe(fixture.oficinaOriginal.CEP)` | ✅ PASS |
| AC6 — `ENDERECO` montado com `TRIM(CONCAT(...))` nas consultas cruas; `logradouro` nulo sem espaço à esquerda | 4 ocorrências; `TRIM` remove o espaço | semântica no Postgres: `__tests__/integration/campanhaService.test.ts:130,134,138,142` — `expect(await montar(null,"Chacara do Ze")).toBe("Chacara do Ze")` etc.; cobertura das 4 montagens: `:149-150` — `expect(arquivo.split(EXPRESSAO).length - 1).toBe(4)` + `expect(arquivo).not.toContain("CONCAT(ce.logradouro, ' ', ce.rua)")` | ✅ PASS |
| AC7 — não alterar `dw.cadastro_empresa.latitude`/`longitude` | chaves ausentes do update; valores idênticos no banco | `__tests__/unit/visitaConfirmacaoService.test.ts:792-793` — `expect(escrito).not.toHaveProperty("LATITUDE"/"LONGITUDE")`; banco real: `visitaEndereco.test.ts:408-409` — `expect(empresa.latitude).toBe(fixture.empresaOriginal.latitude)` (idem longitude) | ✅ PASS |
| AC8 — três consultas sem regra de precedência de fonte e sem consulta por rota | contagem de queries inalterada | `__tests__/unit/campanhaServiceVisita.test.ts:163` — `expect(AppDataSourceSync.query).toHaveBeenCalledTimes(1)`; `:381-385` — `expect(consultasDeRota).toHaveLength(1)`. Nenhuma precedência de fonte foi introduzida no diff de `campanhaService.ts` (só `TRIM` + `LEFT JOIN`) | ✅ PASS |

### P2: Visão gerencial reflete o status

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| AC1 — `GET /campanha/client/:clientId` inclui `notificacaoVisita` com `STATUS` e `CONFIRMADO_EM` em toda rota com linha | objeto com os dois campos | `__tests__/unit/campanhaServiceVisita.test.ts:314-317` — `expect(rotas[0].notificacaoVisita).toEqual({ STATUS: StatusNotificacaoVisita.CONFIRMADO, CONFIRMADO_EM })` | ✅ PASS |
| AC2 — um único `LEFT JOIN` na consulta existente, sem consulta por rota | 1 query de rota contendo o join | `__tests__/unit/campanhaServiceVisita.test.ts:385-388` — `expect(consultasDeRota).toHaveLength(1)` + `expect(consultasDeRota[0][0]).toContain('LEFT JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" nv')`; código `service/campanhaService.ts:462` | ✅ PASS |
| AC3 — `STATUS` é o efetivo (`statusEfetivo()`), não o bruto | `ENVIADO` + `EXPIRA_EM` no passado → `EXPIRADO` | `__tests__/unit/campanhaServiceVisita.test.ts:320` — `expect(rotas[2].notificacaoVisita.STATUS).toBe(StatusNotificacaoVisita.EXPIRADO)` (linha bruta é `ENVIADO`) | ✅ PASS |
| AC4 — `notificacaoVisita` declarado no schema de resposta (regressão) | campo permanece no `RotaPromotorSchema` | código: `schemas/campanha.ts:145` e `schemas/rota.ts:245` — `notificacaoVisita: NotificacaoVisitaStatusInfoSchema.optional()`; gate: `npx tsc --noEmit` limpo | ✅ PASS (regressão, sem teste dedicado) |
| AC5 — campo opcional declarado nos 4 tipos de rota | 4 declarações | `ob-ads/types/vinculo.ts:60`; `ob-ads/.../visao/components/types.ts:25`; `frontend-promotor/lib/types.ts:67` (`RotaAPI`) e `:158` (`RotaPromotor`, snake_case) — todos `?:` | ✅ PASS (gate de build/tsc) |
| AC6 — `normalizeRota` copia status e data para o modelo local | `{status, confirmado_em}`; ausente → chave ausente | `frontend-promotor/service/campanha.service.test.ts:64` — `expect(rota.notificacao_visita).toEqual({ status: "CONFIRMADO", confirmado_em: "2026-02-10T12:00:00.000Z" })`; `:76` — `{ status:"PENDENTE", confirmado_em: null }`; `:85-86` — `expect("notificacao_visita" in rota).toBe(false)` | ✅ PASS |
| AC7 — visão gerencial exibe contagem de confirmadas e de não confirmadas | dois números na tela | **no test evidence**; código `ob-ads/.../visao/components/GerencialView.tsx:72-78` (`rotasParaConfirmacao`, `confirmadasCount`, `naoConfirmadasCount`) e `:281-290` (KpiCards "Visitas Confirmadas" / "Visitas Não Confirmadas") | ❌ Sem evidência de teste |
| AC8 — contagem derivada do payload já carregado, sem chamada nova | zero requests adicionais | **no test evidence**; código: `GerencialView.tsx:72` percorre a prop `campanhasDetail`; nenhum fetch novo no diff | ⚠️ Sem evidência de teste (verificado por inspeção do diff) |

**Status**: 20 ACs no total — **13 ✅ cobertos com asserção**, **6 ⚠️ com cobertura parcial** (camada pura/dados testada, camada de render sem teste — decisão registrada do usuário: componentes React ficam no gate de build), **1 ❌ sem evidência** (P2 AC7).

---

## Edge Cases

| Edge case da spec | Evidência | Resultado |
| --- | --- | --- |
| Rota do banco legado omite `notificacaoVisita` (não nulo, não falha) | `__tests__/unit/campanhaServiceVisita.test.ts:338-339` — `expect(rotas[0]).not.toHaveProperty('notificacaoVisita')` / `expect(rotas[1]).not.toHaveProperty('notificacaoVisita')`; também `:139` — `expect(rotas[0].notificacaoVisita).toBeUndefined()` | ✅ |
| `EXPIRA_EM` no passado + `ENVIADO` → `EXPIRADO` | `campanhaServiceVisita.test.ts:105-107` e `:320` | ✅ |
| Campanha sem nenhuma rota com notificação → payload de hoje, sem campos novos | `campanhaServiceVisita.test.ts:338` (chave ausente, não `null`) | ✅ |
| `ENDERECO` de uma palavra → nome em `rua`, `logradouro` nulo, sem `rua` vazia | `__tests__/unit/logradouro.test.ts:103` — `expect(dividirLogradouro('Rua')).toEqual({ logradouro: null, rua: 'Rua' })` | ✅ |
| Oficina sem linha em `dw.cadastro_empresa` não falha a confirmação | `__tests__/unit/visitaConfirmacaoService.test.ts:805-812` — `empresaRepo.update.mockResolvedValue({ affected: 0 })` → `expect(resultado).toEqual({ state:"CONFIRMED", confirmadoEm: AGORA, enderecoAtualizado: true })` | ✅ |
| `ENDERECO` null / vazio / só espaços → `logradouro = NULL`, `rua` com o mesmo valor de hoje | `__tests__/unit/logradouro.test.ts:110` (`''` → `rua: ''`), `:114` (`null` → `rua: null`), `:118` (`'   '` → `rua: '   '`) | ✅ |

---

## Discrimination Sensor

Isolamento: `git worktree add` descartável por repo (`/tmp/sensor-bp`, `/tmp/sensor-obads`, `/tmp/sensor-fep`), `node_modules` por symlink, `git worktree remove --force` ao final. Nenhuma árvore real foi mutada. `git status --porcelain` de cada repo foi capturado antes (`/tmp/baseline-*.txt`) e conferido idêntico depois. `git stash` não foi usado em momento algum.

| # | Arquivo:linha | Mutação | Gate rodado | Resultado |
| --- | --- | --- | --- | --- |
| 1 | `utils/logradouro.ts:53` | `if (!TIPOS_NORMALIZADOS.has(normalizar(primeiro)))` → `if (true)` — o match de tipo nunca casa, tudo cai no fallback | `jest __tests__/unit/logradouro.test.ts` | ✅ **Killed** — 10 falhas (os 8 tipos + case/acento + trim) |
| 2 | `service/visitaConfirmacaoService.ts:245-246` | chaves do update de `Empresa` trocadas de `LOGRADOURO`/`ENDERECO` para `logradouro`/`rua` (armadilha do silent-ignore do TypeORM) | `jest __tests__/unit/visitaConfirmacaoService.test.ts` | ✅ **Killed** — 2 falhas (`:752` toHaveBeenCalledWith, `:783` LOGRADOURO/ENDERECO) |
| 3 | `service/visitaConfirmacaoService.ts:239-258` | segundo update embrulhado em `try/catch` que engole o erro — falha no `dw` **não** reverte a escrita em `OFICINA` | unit + `jest __tests__/integration/visitaEndereco.test.ts` | ✅ **Killed** duas vezes — unit: 2 falhas (`:832`, `:843`); integração no banco real: `reverte a escrita em OFICINA quando a escrita no dw falha` falhou |
| 4 | `service/campanhaService.ts:596` | removido `...(notificacaoVisita ? { notificacaoVisita } : {})` do literal da rota, mantendo o `LEFT JOIN` (armadilha do silent-drop) | `jest __tests__/unit/campanhaServiceVisita.test.ts` | ✅ **Killed** — `devolve o status efetivo por rota` falhou |
| 5 | `service/campanhaService.ts:494` | uma das quatro `TRIM(CONCAT(...))` revertida para `CONCAT(ce.logradouro, ' ', ce.rua)` (caminho de enriquecimento das rotas legadas) | `jest __tests__/integration/campanhaService.test.ts` | ✅ **Killed** — `aplica a expressão nas quatro montagens de endereço do service` falhou |
| 6 | `frontend-promotor/service/campanha.service.ts:59-67` | spread de `notificacao_visita` removido de `normalizeRota` | `npx jest` (frontend-promotor) | ✅ **Killed** — 2 falhas em `service/campanha.service.test.ts` |
| 7 | `ob-ads/lib/statusConfirmacao.ts:14` | `EXPIRADO: 'nao-recebe'` → `'pendente'` | `npx jest` (ob-ads) | ✅ **Killed** — 1 falha em `lib/statusConfirmacao.test.ts:21` |
| 8 | `frontend-promotor/lib/statusConfirmacao.ts:17` | `EXPIRADO: "nao-recebe"` → `"pendente"` | `npx jest` (frontend-promotor) | ✅ **Killed** — 1 falha em `lib/statusConfirmacao.test.ts:21` |
| 9 | `ob-ads/.../StatusConfirmacaoBadge.tsx:44` + `GerencialView.tsx:75` | badge sempre retorna `null` (nenhum indicador em nenhuma das duas telas) **e** `confirmadasCount` sempre `0` | `npx jest` + `npm run build` (ob-ads) | ❌ **SURVIVED** — 10/10 testes passam, `✓ Compiled successfully` |
| 10 | `frontend-promotor/components/route-carousel.tsx:50` | indicador de confirmação sempre retorna `null` no carrossel e no grid | `npx jest` (frontend-promotor) | ❌ **SURVIVED** — 13/13 testes passam |

**Sensor depth**: expandido (10 mutações, > o mínimo de 5).
**Result**: PASS ✅ — **8/10 killed**. Os dois sobreviventes são exatamente a camada que a Test Coverage Matrix isenta por decisão registrada do usuário ("Componente React → none, só gate de build"). Eles quantificam o custo dessa decisão: **remover completamente o indicador visual das três telas não é detectado por nenhum gate automático dos três repos.** As mutações 1–8 provam que toda a lógica pura, de mapeamento, de SQL e de transação discrimina.

---

## Gate Check

| Repo | Comando | Resultado |
| --- | --- | --- |
| backend-promotor | `npm run test:unit` | **30 suítes / 460 testes, 0 falhas** (baseline pré-feature: 29 suítes / 432 testes → **+1 suíte, +28 testes**, nenhuma deleção) |
| backend-promotor | `npm run test:integration` | 8 suítes passam / 3 falham (só as legadas — ver abaixo). `campanhaService` ✅, `visitaEndereco` ✅ (10/10, inclui os 2 casos de banco real) |
| backend-promotor | `npx tsc --noEmit` | limpo |
| ob-ads | `npm test` | **suíte nova 10/10 ✅**; `Email.test.js` falha (pré-existente, ver abaixo) |
| ob-ads | `npm run lint` | exit **0**, 0 erros, nenhum achado nos arquivos da feature |
| ob-ads | `npm run build` | `✓ Compiled successfully` |
| frontend-promotor | `npm test` | **2 suítes / 13 testes, 0 falhas** (0 → 13) |
| frontend-promotor | `npx tsc --noEmit` | 5 erros, **todos pré-existentes** (`components/ui/calendar.tsx:57`, `lib/mock-data.ts:29/56/83/110`) — nenhum arquivo da feature |
| frontend-promotor | `npm run build` | `✓ Compiled successfully` |
| frontend-promotor | `npm run lint` | quebrado, **pré-existente** (ver abaixo) |

### Separação de quebras pré-existentes (verificadas, não assumidas)

| Quebra | Verificação feita | Veredicto |
| --- | --- | --- |
| backend-promotor: `rotaService`, `campanhaPromotorService`, `campanhaResultsService` falham no teardown por FK | Rodei as 3 suítes num worktree no commit base `4f8a4c0` e no HEAD: **13 falhas / 20 passes em ambos, idêntico**. Erros: `NOTIFICACAO_VISITA_ID_ROTA_PROMOTOR_fkey` e `CAMPANHA_PROMOTOR_ID_PROMOTOR_fkey`. Registrado em `.specs/project/STATE.md:36` | ✅ Pré-existente, **não é regressão da feature** |
| backend-promotor: run completo de integração marcou 15 falhas numa execução e 13 noutra | As 3 suítes legadas isoladas dão 13/13 estável nos dois commits; a variação aparece só no run completo → interferência de estado de banco entre suítes legadas | ✅ Flakiness pré-existente das suítes legadas |
| ob-ads: `app/(dashboard)/dashboard/Email.test.js` | Reproduzido: `Cannot find module '@testing-library/dom' from node_modules/@testing-library/react/dist/pure.js`. Não é erro de parser — o runner foi destravado pela T6 | ✅ Pré-existente, decisão do usuário de deixar assim |
| frontend-promotor: `npm run lint` | Script é `next lint`, removido no Next 16 (repo em 16.1.6) e `eslint` não instalado. Substituído por `npx tsc --noEmit` + `npm run build`, ambos conforme esperado | ✅ Pré-existente |

**Isolamento do sensor**: `git status --porcelain` dos três repos idêntico ao baseline pré-sensor. Um `tsconfig.tsbuildinfo` gerado pelo `npx tsc --noEmit` no `frontend-promotor` foi removido para restaurar o baseline exato. `git worktree list` de cada repo voltou a listar só a árvore principal.

---

## Task Completion

| Tasks | Status | Notas |
| --- | --- | --- |
| T1–T4 (backend-promotor) | ✅ Done | Código verificado em `utils/logradouro.ts`, `service/visitaConfirmacaoService.ts:239-258`, `service/campanhaService.ts:462,596` + 4 sites de `TRIM` |
| T5–T11 (ob-ads) | ✅ Done | T5 é o commit `43e29b8` (`types/vinculo.ts:60`), fora do range informado; verificado no código |
| T12–T16 (frontend-promotor) | ✅ Done | Runner jest funcional, tipos, mapper, `normalizeRota`, carrossel |
| T6 "Test count" | ⚠️ Parcial, aceito | Único item deixado desmarcado em `tasks.md`, por causa do `Email.test.js` pré-existente — decisão do usuário |

---

## Code Quality

| Princípio | Status |
| --- | --- |
| Código mínimo, sem features além do pedido | ✅ |
| Mudanças cirúrgicas (10 arquivos de produção nos 3 repos) | ✅ |
| Sem scope creep — os únicos arquivos extras (`jest.config.js` dos dois frontends) foram autorizados nominalmente nas T6/T12 | ✅ |
| Segue os padrões do projeto (SCREAMING_SNAKE na API, propriedades de entity, utilitário puro no padrão de `utils/telefone.ts`) | ✅ |
| Spec-anchored: valores asseridos batem com o outcome da spec | ✅ nas camadas testadas |
| Coverage Expectation por camada | ⚠️ Domínio 1:1 com as ACs ✅; componentes React sem teste por decisão registrada |
| Todo teste mapeia a uma AC/edge case (sem testes órfãos) | ✅ — cada `describe`/`it` novo cita o VISIB ou a AC |
| Diretrizes documentadas seguidas | ✅ `.specs/codebase/TESTING.md`, `jest.config.ts`, Test Coverage Matrix de `tasks.md` |
| Itens fora de escopo respeitados (`RECUSADO`, geocoding) | ✅ `RECUSADO` cai em `null` por teste; `latitude`/`longitude` provadamente intocadas |

---

## Requirement Traceability

| Requirement | Novo status | Base |
| --- | --- | --- |
| VISIB-01 | ✅ Verified | `campanhaServiceVisita.test.ts:314` |
| VISIB-02 | ✅ Verified | `campanhaServiceVisita.test.ts:320` |
| VISIB-03 | ⚠️ Verified (mapper) / sem teste no render | `ob-ads/lib/statusConfirmacao.test.ts:5-41`; mutante 9 sobreviveu |
| VISIB-04 | ⚠️ Verified (mapper) / sem teste no render | `frontend-promotor/lib/statusConfirmacao.test.ts:5-41`; mutante 10 sobreviveu |
| VISIB-05 | ✅ Verified | `campanhaServiceVisita.test.ts:181` |
| VISIB-06 | ✅ Verified | `campanhaServiceVisita.test.ts:338`; mappers `:33,37,41` |
| VISIB-07 | ✅ Verified | `visitaEndereco.test.ts:396,400-401`; unit `:738,752` |
| VISIB-08 | ✅ Verified | `visitaConfirmacaoService.test.ts:792`; `visitaEndereco.test.ts:408` |
| VISIB-09 | ✅ Verified | `schemas/campanha.ts:145`, `schemas/rota.ts:245` + tsc |
| VISIB-10 | ❌ Sem evidência de teste | Só código: `GerencialView.tsx:72-78,281-290`; mutante 9 sobreviveu |
| VISIB-11 | ✅ Verified | `logradouro.test.ts:11,96,103,110,114,118` |
| VISIB-12 | ✅ Verified | `campanhaService.test.ts (integration):130-150` |
| VISIB-13 | ✅ Verified | `visitaEndereco.test.ts:453-455`; unit `:832,857` |
| VISIB-14 | ✅ Verified | 4 declarações de tipo + tsc/build |
| VISIB-15 | ✅ Verified | `frontend-promotor/service/campanha.service.test.ts:64,76,85` |

---

## Ranked Gaps

1. **[Major] VISIB-10 / P2 AC7 não tem nenhuma asserção.** Os dois `KpiCard` de confirmadas / não confirmadas (`ob-ads/.../GerencialView.tsx:281-290`) e o cálculo em `:72-78` não são cobertos por teste algum. O mutante 9 provou o custo: forçar `confirmadasCount = 0` passa por `npm test` e por `npm run build`. Diferente das outras ACs de UI, aqui a lógica de contagem é *lógica*, não render — é extraível para uma função pura testável (`contarConfirmacoes(campanhasDetail)`), o que a alinharia à própria Test Coverage Matrix ("função pura de mapeamento → unit").
2. **[Minor, aceito] VISIB-03 / VISIB-04 — camada de render sem teste.** Mutantes 9 e 10: remover o indicador das três telas não é detectado. É a consequência direta e conhecida da decisão registrada em `tasks.md:41` (componentes React só no gate de build). Não é desvio da spec; fica como risco declarado. Mitigado parcialmente pela cobertura 1:1 dos mappers nos dois repos.
3. **[Minor] P1 promotor AC2 — spec-precision gap.** A spec exige "exibir a data de confirmação" sem definir formato; a implementação escolheu `toLocaleDateString('pt-BR')` (`route-carousel.tsx:38`, `StatusConfirmacaoBadge.tsx:37`). Não há outcome preciso contra o qual asserir.
4. **[Informativo] P1 dashboard AC6 / P2 AC8 ("sem chamada de API nova") não têm asserção nos frontends.** Verificado por inspeção do diff (nenhum `fetch`/`useQuery` novo) e pelas asserções de contagem de query no backend (`campanhaServiceVisita.test.ts:163,385`). O Independent Test da spec prevê conferência manual no DevTools.
5. **[Informativo] Range de commits do ob-ads informado exclui a T5.** `43e29b8..c9c7b96` deixa de fora o próprio `43e29b8`, que é a T5. Range correto: `8a99701..c9c7b96`.

Nenhum destes bloqueia a feature: todas as ACs com outcome preciso e testável estão cobertas e discriminam sob mutação.

---

## Summary

**Overall**: ✅ **Ready**

**Spec-anchored check**: 20 ACs — 13 ✅ cobertos com asserção, 6 ⚠️ parciais (camada de render isenta por decisão registrada), 1 ❌ sem evidência (P2 AC7).
**Sensor**: 10 mutações, **8 killed**, 2 sobreviveram (ambas na camada de componente React isenta de teste).
**Gate**: backend 460 unit ✅ (+28) / integração no baseline; ob-ads 10 ✅ + lint 0 + build ✅; frontend-promotor 13 ✅ + build ✅.
**Pré-existente, não regressão**: 3 suítes de integração legadas (idênticas em `4f8a4c0` e HEAD), `Email.test.js` do ob-ads, `next lint` do frontend-promotor.

**O que funciona**: a escrita transacional nas duas tabelas com rollback comprovado contra o banco real; o split `logradouro`/`rua` em todos os ramos; as 4 montagens com `TRIM`; o `LEFT JOIN` único com status efetivo na consulta por cliente; a preservação do campo em `normalizeRota`; os dois mappers em paridade 1:1.

**Próximos passos sugeridos** (não bloqueantes): extrair e testar a contagem de confirmação do `GerencialView` (gap 1); registrar formalmente o risco de UI não testada (gap 2). **Nota posterior (2026-08-17):** os dois "pré-requisitos de deploy" citados na versão original deste parágrafo foram removidos dos artefatos. A carga de ETL sobre `dw.cadastro_empresa` era hipótese não verificada (uma varredura dos 16 repos achou apenas leitores); e o usuário confirmou que `NOTIFICACAO_VISITA` está vazia em produção, então não há backfill a fazer.
