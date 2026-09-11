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

- **Feature**: duas em paralelo — `importador-oficinas-de-para` e `modo-definicao-rota` (`.specs/features/`)
- **Phase / Task**: Specify e Design concluidos para as duas. `context.md`, `spec.md` e `design.md` escritos; `validate_spec.py` passa limpo em ambos.
- **Completed**: Specify, Design (as duas features)
- **In-progress**: aguardando confirmacao humana dos designs antes de Tasks
- **Next step**: quebrar em tasks. As duas sao Large, entao `tasks.md` formal em cada uma, com `validate_tasks.py` antes de apresentar.
- **Blockers**: nenhum
- **Uncommitted files**: `.specs/features/importador-oficinas-de-para/*`, `.specs/features/modo-definicao-rota/*`, `.specs/STATE.md`, `package-lock.json` (modificado antes desta sessao)
- **Branch**: feat/importador-oficinas
- **Ordem de execucao obrigatoria**: `importador-oficinas-de-para` primeiro, `modo-definicao-rota` depois — as duas editam `ob-ads/.../wizard/StepPromotores.tsx`.
- **Nota de precedencia**: `importador-oficinas-de-para` revoga IMPORT-01 e IMPORT-03 da spec `importador-oficinas`; o restante daquela spec continua valendo.
