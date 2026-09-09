# STATE

## Decisions

### AD-001
- **Decision**: Uma oficina vinculada a um cliente sem depender de usuário/comunidade é representada por uma tabela dedicada, `CAMPANHAS_OB.OFICINA_IMPORTADA` (`ID_OFICINA` + `EMPRESA_SLUG`), consultada em paralelo (UNION) às queries existentes que hoje passam por `OFICINA_PORTAL.COMMUNITIES` → `MAIN_REGISTER.USUARIO_COMMUNITY` → `MAIN_REGISTER.USUARIO`.
- **Reason**: Toda consulta de "oficinas da comunidade" (mapa, atribuição automática de rota) hoje exige uma linha real em `USUARIO_COMMUNITY`, o que pressupõe um usuário. O importador de oficinas (CON26-162) precisa suportar oficinas sem usuário. Criar um usuário/community-member sintético reaproveitaria as queries existentes de graça, mas corromperia a semântica de `USUARIO_COMMUNITY` (deixaria de significar "usuário real inscrito") para qualquer leitor futuro dessa tabela.
- **Trade-off**: Uma tabela nova exige estender 3 métodos de leitura (`getComunityNearbyOficinas`, `getCommunityOficinas`, `countCommunityOficinas` em `service/oficinaService.ts`) com `UNION ALL` em vez de reaproveitar a cadeia existente sem nenhuma mudança. Em troca, a tabela de usuários reais nunca recebe registros sintéticos, e o vínculo é isolado/reversível via sua própria migration.
- **Scope**: Qualquer feature futura que precise vincular oficina↔cliente sem usuário deve reaproveitar `CAMPANHAS_OB.OFICINA_IMPORTADA` em vez de criar uma tabela nova ou inserir um usuário sintético em `USUARIO_COMMUNITY`.
- **Date**: 2026-09-09
- **Status**: active

## Handoff

- **Feature**: importador-oficinas (`.specs/features/importador-oficinas/`)
- **Phase / Task**: Specify + Design + Tasks concluídos (spec.md, context.md, design.md, tasks.md — 13 tasks, `validate_spec.py`/`validate_tasks.py` limpos). Execute NÃO iniciado — aguardando aprovação explícita do usuário.
- **Completed**: Specify, Design, Tasks
- **In-progress**: nenhum arquivo de código tocado ainda — só artefatos `.specs/`
- **Next step**: Usuário revisa `spec.md`/`design.md`/`tasks.md`; após aprovação, iniciar Execute pela Task T1 (Fase 1), seguindo `tasks.md` — nenhuma task requer acesso a banco real
- **Blockers**: nenhum — todas as decisões de arquitetura/schema foram confirmadas com o usuário (ver `context.md`)
- **Uncommitted files**: `.specs/features/importador-oficinas/spec.md`, `.specs/features/importador-oficinas/context.md`, `.specs/features/importador-oficinas/design.md`, `.specs/features/importador-oficinas/tasks.md`, `.specs/STATE.md`
- **Branch**: feat/importador-oficinas
