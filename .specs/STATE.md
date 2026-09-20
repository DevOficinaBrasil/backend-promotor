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

- **Feature**: importador-oficinas (`.specs/features/importador-oficinas/`) — **DONE**
- **Phase / Task**: Specify + Design + Tasks + Execute + Verify todos concluídos. 13 tasks implementadas (13 commits) + 3 iterações de fix→re-verify (10 commits adicionais) até o Verifier independente retornar **PASS** na iteração 3/3. `validate_state.py` confirma o gate de conclusão.
- **Completed**: Specify, Design, Tasks, Execute, Verify (PASS)
- **In-progress**: nada — branch pronta para revisão humana/PR
- **Next step**: Revisão humana da branch `feat/importador-oficinas` (23 commits sobre `main`) e, quando aprovada, `git push` + abertura de PR (não feito nesta sessão — push/PR exigem autorização explícita separada). Antes do deploy: aplicar `scripts/migration-oficina-importada.sql` manualmente (DBA) e validar o `UNION ALL` das 3 queries de comunidade contra um Postgres real (nunca executado nesta sessão, por restrição explícita) — ver `validation.md`, observação O6.
- **Blockers**: nenhum
- **Uncommitted files**: nenhum — árvore de trabalho limpa em `fe34a96`
- **Branch**: feat/importador-oficinas
