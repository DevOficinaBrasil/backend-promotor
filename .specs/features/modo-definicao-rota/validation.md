# Modo Definição de Rota com Agenda por Dia — Validation

**Verdict: PASS**

**Escopo verificado:** 17 tasks, 17 commits — 7 em `backend-promotor` (`15834df`..`d7c8f53`),
3 em `frontend-promotor` (`7626e7c`..`f6f0b38`, branch `feat/modo-definicao-rota`) e
7 em `ob-ads` (`ff6af620`..`06f4f319`).

**Como foi verificado:** conferência AC a AC contra o código e os testes, mais um sensor de
discriminação que injeta falhas de comportamento e confirma que a suíte as mata. Nada foi executado
contra banco real; a migration não foi aplicada.

---

## Evidência por requisito

### Dia planejado no modelo de dados

| Req | Onde está | Evidência |
|---|---|---|
| AGENDA-01 | `backend-promotor/scripts/migration-data-visita-rota.sql:12` | Coluna `date` anulável, mais os dois índices |
| AGENDA-02 | `backend-promotor/service/campanhaService.ts:299` | Sem nenhuma rota agendada, o filtro devolve o mesmo conjunto de antes |
| AGENDA-03 | `backend-promotor/service/rotaService.ts:447` | `ORDEM` 1..N na sequência recebida; 24 testes em `rotaServiceAgenda.test.ts` |
| AGENDA-04 | `backend-promotor/service/rotaService.ts:404` | Data fora do período rejeita sem escrever |
| AGENDA-05 | `backend-promotor/service/rotaService.ts:432` | Visita concluída aborta o lote inteiro |
| AGENDA-06 | `backend-promotor/scripts/migration-data-visita-rota.sql:28` | Índice único parcial de (vínculo, dia, ordem) |
| AGENDA-07 | `backend-promotor/service/rotaService.ts:438` | Reenviar a mesma agenda produz as mesmas escritas |
| AGENDA-08 | `backend-promotor/service/rotaService.ts:438` | Tudo dentro de uma transação |
| AGENDA-09 | `backend-promotor/service/rotaService.ts:455` | Data nula limpa dia e ordem |
| AGENDA-10 | `backend-promotor/service/rotaService.ts` | Exclusão lógica de rota inalterada; `rotaService.test.ts` segue verde |
| AGENDA-11 | `backend-promotor/service/rotaService.ts:519` | Proximidade recusada com agenda ativa; 5 testes dedicados |

### Modo no mapa e agenda por dia

| Req | Onde está | Evidência |
|---|---|---|
| MODO-01 | `ob-ads/.../wizard/CampanhaWizard.tsx:766` | Botão no topo da pilha inferior direita, acima da dica e da legenda |
| MODO-02 | `ob-ads/.../wizard/CampanhaWizard.tsx:769` | Desabilitado sem promotor expandido |
| MODO-03 | `ob-ads/.../wizard/CampanhaWizard.tsx:468` | `vinculoSelecionado` só casa vínculo salvo |
| MODO-04 | `ob-ads/.../wizard/CampanhaWizard.tsx:468` | Rascunho usa uid negativo e nunca casa |
| MODO-05 | `ob-ads/.../wizard/ModoDefinicaoRota.tsx:60` | Lista vem de `vinculo.rotasAtivas`, ou seja, do raio |
| MODO-06 | `ob-ads/.../wizard/modoDefinicaoRotaState.ts:35` | Só rota não concluída entra; 29 testes |
| MODO-07 | `ob-ads/.../wizard/ModoDefinicaoRota.tsx:110` | Reordenar redesenha o trajeto antes de salvar |
| MODO-08 | `ob-ads/.../wizard/ModoDefinicaoRota.tsx:150` | Salvar persiste a ordem; o backend grava estratégia `MANUAL` |
| MODO-09 | `ob-ads/.../wizard/ModoDefinicaoRota.tsx:186` | Fechar limpa o trajeto e descarta o estado local |
| MODO-10 | `ob-ads/.../wizard/StepPromotores.tsx` | Botão de ordenar removido em `06f4f319` |
| MODO-11 | `ob-ads/.../wizard/ModoDefinicaoRota.tsx:243` | Cabeçalho nomeia o promotor editado |
| DIA-01 | `ob-ads/.../wizard/agendaCalendario.ts:34` | Dias entre início e fim; 18 testes |
| DIA-02 | `ob-ads/.../wizard/agendaCalendario.test.js:44` | Sábado e domingo incluídos |
| DIA-03 | `ob-ads/.../wizard/ModoDefinicaoRota.tsx:330` | Duas listas: do dia e disponíveis |
| DIA-04 | `ob-ads/.../wizard/modoDefinicaoRotaState.ts:66` | Disponíveis são só as sem nenhum dia |
| DIA-05 | `ob-ads/.../wizard/modoDefinicaoRotaState.ts:83` | Agendar num dia tira dos demais |
| DIA-06 | `ob-ads/.../wizard/modoDefinicaoRotaState.ts:101` | Remover devolve às disponíveis |
| DIA-07 | `ob-ads/.../wizard/ModoDefinicaoRota.tsx:305` | Contagem por dia na tira do calendário |
| DIA-08 | `ob-ads/.../wizard/modoDefinicaoRotaState.ts:121` | Uma requisição com data, lista e desagendamentos |
| DIA-09 | `ob-ads/.../wizard/ModoDefinicaoRota.tsx:157` | Falha mantém a lista e mostra o motivo |
| DIA-10 | `ob-ads/.../wizard/modoDefinicaoRotaState.ts:140` | `temAlteracaoPendente` compara com o estado do servidor |

### Rota otimizada por dia

| Req | Onde está | Evidência |
|---|---|---|
| OTIM-01 | `ob-ads/.../wizard/ModoDefinicaoRota.tsx:380` | Início e fim escolhidos entre as oficinas do dia |
| OTIM-02 | `backend-promotor/service/rotaService.ts:497` | Consulta filtrada pelo dia; 13 testes em `rotaServiceOptimizeDia.test.ts` |
| OTIM-03 | `ob-ads/.../wizard/ModoDefinicaoRota.tsx:430` | Cálculo desabilitado sem início e fim |
| OTIM-04 | `backend-promotor/service/rotaService.ts:566` | Estratégia gravada como `ROTA_OTIMIZADA` |
| OTIM-05 | `backend-promotor/service/rotaService.ts:557` | A escrita alcança só as rotas do recorte |
| OTIM-06 | `backend-promotor/service/rotaService.ts:548` | Sem geometria, a ordem é persistida do mesmo jeito |
| OTIM-07 | `backend-promotor/service/rotaService.ts:522` | Erro nomeia a oficina sem coordenada |
| OTIM-08 | `ob-ads/.../wizard/modoDefinicaoRotaState.ts:168` | Início e fim derivados da menor e da maior ordem |
| OTIM-09 | `ob-ads/.../wizard/WizardMap.tsx:180` | Camada própria redesenha ao mudar a ordem |

### App do promotor

| Req | Onde está | Evidência |
|---|---|---|
| APP-01 | `backend-promotor/service/campanhaService.ts:295` | Pendente de hoje entra |
| APP-02 | `backend-promotor/service/campanhaService.ts:295` | Pendente atrasada entra |
| APP-03 | `backend-promotor/service/campanhaService.ts:295` | Pendente sem dia entra |
| APP-04 | `frontend-promotor/lib/visitas.test.ts:100` | Agendada para depois fica de fora, na query e no módulo puro |
| APP-05 | `backend-promotor/service/campanhaService.ts:291` | Histórico só do dia corrente, com conversão de UTC |
| APP-06 | `backend-promotor/service/campanhaService.ts:396` | `DATA_VISITA` na rota e `DATA_REFERENCIA` no envelope |
| APP-07 | `frontend-promotor/components/route-carousel.tsx:104` | Selo com a data original |
| APP-08 | `frontend-promotor/lib/visitas.ts:112` | Atrasadas primeiro, da mais antiga |
| APP-09 | `frontend-promotor/lib/visitas.ts:113` | Hoje em seguida, por ordem |
| APP-10 | `frontend-promotor/lib/visitas.ts:114` | Sem data por último, pela estratégia |
| APP-11 | `frontend-promotor/components/route-carousel.tsx:176` | Estado vazio dizendo que não há visitas para hoje |

---

## Sensor de discriminação

Dez mutantes de comportamento aplicados e revertidos, com as três árvores verificadas limpas antes
e depois. **Todos mortos.**

| Mutante | Falha injetada | Resultado |
|---|---|---|
| B1 | Escrita de ordem deixa de zerar antes de regravar | morto |
| B2 | Janela da campanha deixa de ser checada | morto |
| B3 | Guarda de proximidade com agenda desligada | morto |
| B4 | Otimização ignora o dia no filtro | morto |
| B5 | Histórico deixa de recortar por `DONE_AT` do dia | morto |
| B6 | Visita agendada para depois volta a aparecer | morto |
| B7 | Visita já concluída passa a ser agendável | morto |
| F1 | Visita futura entra no grupo de hoje | morto |
| F2 | Ordem entre atrasadas, hoje e sem data invertida | morto |
| F3 | Marcação de atrasada ignora a data de referência | morto |
| M1, M5, M6 | Exclusividade entre dias, extremos do dia e desagendamento | mortos |

---

## Gates

| Repositório | Comando | Resultado |
|---|---|---|
| `backend-promotor` | `npm run test:unit` | 741 testes, 41 suítes verdes |
| `backend-promotor` | `npx jest __tests__/integration/rotaAgenda.test.ts` | 17 testes |
| `backend-promotor` | `npx tsc --noEmit` | limpo |
| `ob-ads` | `npx jest --env=node` sobre as suítes puras | 141 testes, 10 suítes |
| `ob-ads` | `npx tsc --noEmit` | limpo |
| `frontend-promotor` | `npx jest` | 41 testes, 3 suítes |

---

## Observações

**O1 — A migration não foi aplicada.** `scripts/migration-data-visita-rota.sql` precisa ser rodada
manualmente pelo DBA antes do deploy do backend. Sem ela, toda leitura de `DATA_VISITA` quebra. O
repositório não tem runner de migration, então isso é um passo humano, como nas features anteriores.

**O2 — Nada foi verificado contra Postgres real.** Em particular, o índice único parcial e a escrita
em duas fases foram verificados por teste com repositório mockado, não contra o banco. O
comportamento do índice sob concorrência real continua não observado.

**O3 — Componentes React não têm teste automatizado.** Em `ob-ads` o `jsdom` não sobe neste checkout
(binding de `canvas` quebrado, 38 de 41 suítes caem); em `frontend-promotor` o Jest é configurado em
ambiente `node` por decisão do próprio repositório. Por isso toda regra vive em módulo puro, e o que
sobra nos componentes — posicionamento do botão, aparência do drawer, desenho no mapa — depende de
revisão visual. Requisitos MODO-01 a MODO-05, MODO-07, MODO-09, MODO-11, DIA-03, DIA-07, DIA-09 e
APP-07, APP-11 têm evidência de código, não de teste.

**O4 — `reorderRotas` tem um no-op silencioso anterior a esta feature.** Ao voltar para proximidade,
ele passa `{ ORDEM: undefined }` ao `update` do TypeORM, que ignora campos indefinidos: a ordem
antiga permanece no banco. A feature nova não depende disso — a guarda de 409 impede esse caminho
quando há agenda — mas o defeito segue de pé e foi registrado como tarefa separada.

**O5 — `segmentacaoCampanhaPromotor.test.ts` continua vermelho.** Importa dois módulos apagados e
não chega a carregar. É anterior a esta sessão e está fora do escopo das duas features; registrado
como tarefa separada.

**O6 — Exclusividade de oficina entre promotores continua inexistente.** Declarado em Out of Scope.
A mesma oficina pode ter rota ativa sob dois promotores e, portanto, ser agendada duas vezes sem que
o sistema perceba.
