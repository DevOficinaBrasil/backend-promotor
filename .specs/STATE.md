# STATE

## Decisions

### AD-001
- **Decision**: Uma oficina vinculada a um cliente sem depender de usuário/comunidade é representada por uma tabela dedicada, `CAMPANHAS_OB.OFICINA_IMPORTADA` (`ID_OFICINA` + `EMPRESA_SLUG`), consultada em paralelo (UNION) às queries existentes que hoje passam por `OFICINA_PORTAL.COMMUNITIES` → `MAIN_REGISTER.USUARIO_COMMUNITY` → `MAIN_REGISTER.USUARIO`.
- **Reason**: Toda consulta de "oficinas da comunidade" (mapa, atribuição automática de rota) hoje exige uma linha real em `USUARIO_COMMUNITY`, o que pressupõe um usuário. O importador de oficinas (CON26-162) precisa suportar oficinas sem usuário. Criar um usuário/community-member sintético reaproveitaria as queries existentes de graça, mas corromperia a semântica de `USUARIO_COMMUNITY` (deixaria de significar "usuário real inscrito") para qualquer leitor futuro dessa tabela.
- **Trade-off**: Uma tabela nova exige estender 3 métodos de leitura (`getComunityNearbyOficinas`, `getCommunityOficinas`, `countCommunityOficinas` em `service/oficinaService.ts`) com `UNION ALL` em vez de reaproveitar a cadeia existente sem nenhuma mudança. Em troca, a tabela de usuários reais nunca recebe registros sintéticos, e o vínculo é isolado/reversível via sua própria migration.
- **Scope**: Qualquer feature futura que precise vincular oficina↔cliente sem usuário deve reaproveitar `CAMPANHAS_OB.OFICINA_IMPORTADA` em vez de criar uma tabela nova ou inserir um usuário sintético em `USUARIO_COMMUNITY`.
- **Date**: 2026-09-09
- **Status**: active

### AD-002
- **Decision**: O dia planejado de uma visita vive em `CAMPANHAS_OB.ROTA_PROMOTOR.DATA_VISITA` (`date`, anulavel), e `ROTA_PROMOTOR.ORDEM` passa a significar a ordem **dentro do dia**. Para rotas sem `DATA_VISITA`, `ORDEM` mantem o significado anterior (ordem no vinculo). A unicidade de `ORDEM` por dia e garantida por indice unico parcial em (`ID_CAMPANHA_PROMOTOR`, `DATA_VISITA`, `ORDEM`).
- **Reason**: A agenda de visitas por dia (modo definicao de rota) precisava de um lugar para o dia planejado. Uma tabela dedicada isolaria melhor o conceito, mas obrigaria um join novo em `getActiveCampanhaByPromotor`, que e o caminho quente do app de campo, e em toda leitura de rota do mapa.
- **Trade-off**: Como o indice unico parcial nao e adiavel em Postgres, toda escrita de ordem precisa acontecer em duas fases dentro de uma transacao (zera `ORDEM` do recorte, depois grava 1..N). Em troca, a garantia de ordem por dia existe no banco e nao apenas por convencao no codigo, e nenhuma leitura existente ganha join.
- **Scope**: Qualquer feature futura de agendamento de visita reaproveita `DATA_VISITA` em vez de criar tabela ou coluna nova. Qualquer codigo que escreva `ORDEM` precisa respeitar o recorte por dia e a escrita em duas fases.
- **Date**: 2026-09-11
- **Status**: active

## Handoff

- **Feature**: `importador-oficinas-de-para` e `modo-definicao-rota` — ambas **DONE**
- **Phase / Task**: Specify, Design, Tasks, Execute e Verify concluidos nas duas. 28 tasks, 28 commits de codigo. `validate_spec.py`, `validate_tasks.py` e `validate_state.py` passam limpos; as duas `validation.md` estao em PASS.
- **Completed**: tudo
- **In-progress**: nada
- **Next step**: revisao humana e, quando aprovada, `git push` mais PR nos tres repositorios (nao feito nesta sessao — push exige autorizacao propria). **Antes do deploy do backend**, aplicar `scripts/migration-data-visita-rota.sql` manualmente: sem a coluna `DATA_VISITA`, toda leitura de rota quebra.
- **Blockers**: nenhum
- **Branches**: `backend-promotor` em `feat/importador-oficinas`; `ob-ads` em `feat/importador-oficinas-promotores`; `frontend-promotor` em `feat/modo-definicao-rota` (criada nesta sessao a partir de `main`)
- **Gates finais**: backend 741 testes em 41 suites verdes (mais `segmentacaoCampanhaPromotor`, vermelha desde antes desta sessao e fora de escopo); ob-ads 141 testes em 10 suites puras; frontend-promotor 41 testes em 3 suites. `npx tsc --noEmit` limpo em backend-promotor e ob-ads.
- **Sensor de discriminacao**: 16 mutantes de comportamento injetados nas tres bases, todos mortos pela suite; arvores verificadas limpas antes e depois.
- **Divida registrada como tarefa separada**: `ImportOficinasResultModal.tsx` sem referencia no ob-ads; `segmentacaoCampanhaPromotor.test.ts` importando modulos apagados; no-op silencioso de `reorderRotas` ao limpar `ORDEM` com `undefined`.
- **Achado de seguranca**: `frontend-promotor/.env`, arquivo rastreado pelo git, tem chave de acesso AWS em texto puro na copia de trabalho. Nao foi commitado nesta sessao e nao foi tocado.
