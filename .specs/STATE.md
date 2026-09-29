# STATE

## Decisions

### AD-001
- **Decision**: Uma oficina vinculada a um cliente sem depender de usuário/comunidade é representada por uma tabela dedicada, `CAMPANHAS_OB.OFICINA_IMPORTADA` (`ID_OFICINA` + `EMPRESA_SLUG`), consultada em paralelo (UNION) às queries existentes que hoje passam por `OFICINA_PORTAL.COMMUNITIES` → `MAIN_REGISTER.USUARIO_COMMUNITY` → `MAIN_REGISTER.USUARIO`.
- **Reason**: Toda consulta de "oficinas da comunidade" (mapa, atribuição automática de rota) hoje exige uma linha real em `USUARIO_COMMUNITY`, o que pressupõe um usuário. O importador de oficinas (CON26-162) precisa suportar oficinas sem usuário. Criar um usuário/community-member sintético reaproveitaria as queries existentes de graça, mas corromperia a semântica de `USUARIO_COMMUNITY` (deixaria de significar "usuário real inscrito") para qualquer leitor futuro dessa tabela.
- **Trade-off**: Uma tabela nova exige estender 3 métodos de leitura (`getComunityNearbyOficinas`, `getCommunityOficinas`, `countCommunityOficinas` em `service/oficinaService.ts`) com `UNION ALL` em vez de reaproveitar a cadeia existente sem nenhuma mudança. Em troca, a tabela de usuários reais nunca recebe registros sintéticos, e o vínculo é isolado/reversível via sua própria migration.
- **Scope**: Qualquer feature futura que precise vincular oficina↔cliente sem usuário deve reaproveitar `CAMPANHAS_OB.OFICINA_IMPORTADA` em vez de criar uma tabela nova ou inserir um usuário sintético em `USUARIO_COMMUNITY`.
- **Date**: 2026-09-09
- **Status**: active

### AD-003
- **Decision**: "Aceito" é `STATUS='CONFIRMADO'` em `CAMPANHAS_OB.NOTIFICACAO_VISITA`, com a forma de aceite em `ORIGEM_ACEITE` (`REPARADOR`, `CONFIRMACAO_RECENTE`, `CONVITE_VINCULADO`, `IMPORTADA`). `GET /campanha/ativa` mostra uma rota em `BACKLOG` só se o convite dela estiver `CONFIRMADO`. Esta regra substitui a de `filtro-rotas-por-confirmacao` (`CONFIRMACAO_RESOLVIDA`).
- **Reason**: O disparo pelo admin traz aceites que não passam pelo reparador (confirmação recente, convite vinculado, oficina importada). Um status novo por forma de aceite espalharia a pergunta "está aceito?" por vários valores. Com uma coluna de origem, `CONFIRMADO` é a única fonte de "aceito" e o outbox existente segue sem mudança.
- **Trade-off**: Todo leitor de "aceito" consulta `STATUS='CONFIRMADO'` e, quando a origem importa, também `ORIGEM_ACEITE`. A guarda de confirmação recente conta só `ORIGEM_ACEITE='REPARADOR'`, senão um aceite automático renovaria a janela para sempre. Os consumidores de `CONFIRMACAO_RESOLVIDA` saem ou são atualizados, e rota em `BACKLOG` ainda sem aceite fica fora da lista do promotor.
- **Scope**: Qualquer feature que pergunte se uma visita foi aceita usa `STATUS='CONFIRMADO'`. Uma forma nova de aceite vira um valor novo de `ORIGEM_ACEITE`, nunca um status novo.
- **Date**: 2026-09-28
- **Status**: active

### AD-004
- **Decision**: Os endpoints de admin do backend-promotor ficam em `/admin/*`, atrás de `adminAuthMiddleware`. O middleware valida o JWT emitido pelo backend-ob-ads com `OBADS_JWT_SECRET` e exige a claim `user.IS_ADMIN` verdadeira (401 sem token ou com token inválido, 403 sem `IS_ADMIN`).
- **Reason**: O backend-promotor não acessa o SQL Server onde está `IS_ADMIN`, então a checagem é pela claim do token que o admin já tem no ob-ads. O `JWT_SECRET` do backend-promotor assina o login do promotor e não pode ser trocado, por isso a variável separada.
- **Trade-off**: A claim vale pelos 7 dias do token sem revalidação: um admin rebaixado mantém o acesso até o token expirar. `OBADS_JWT_SECRET` precisa ter o mesmo valor do `JWT_SECRET` do backend-ob-ads em todo ambiente.
- **Scope**: Todo endpoint de admin futuro do backend-promotor fica sob `/admin/*` e reusa `adminAuthMiddleware`, sem outro esquema de auth.
- **Date**: 2026-09-28
- **Status**: active

## Handoff

- **Feature**: disparo-convite-visita-admin (`.specs/features/disparo-convite-visita-admin/`), **DONE**
- **Phase / Task**: Specify, Design, Tasks, Execute e Verify concluídos. As 36 tasks estão commitadas nos três repos. O Verifier deu **PASS**: 47/47 requisitos com evidência e 22/22 mutantes mortos. `validate_state.py` terminou com exit 0.
- **Completed**: tudo. Depois do Verifier foram feitas mais duas coisas:
  - as fixtures de `campanhaService*` receberam `STATUS='PUBLICADA'` (EG-1);
  - no ob-ads, a coluna passou a se chamar "Promotores vinculados".
- **In-progress**: nada
- **Next step**:
  1. Decisão do usuário sobre SPG-2. A recusa hoje só bloqueia nova rota no fluxo admin. Opções: proteger também os fluxos do cliente e o despacho, ou restringir a spec ao admin.
  2. UAT no navegador (ob-ads admin e página do jornal).
  3. Aplicar `scripts/migration-convite-visita-admin.sql` em homolog, com a prévia de impacto que está no cabeçalho do script. Depois validar os backfills e fazer um teste de disparo concorrente.
  4. Configurar `OBADS_JWT_SECRET` com o mesmo valor do `JWT_SECRET` do backend-ob-ads.
  5. `git push` e PRs nos três repos. Exigem autorização explícita.
- **Blockers**: nenhum técnico. SPG-2 depende de decisão de produto.
- **Uncommitted files**:
  - `.specs/LESSONS.md`, `.specs/lessons.json`: mudanças que já existiam, mais as lições L-017..L-022 do Verifier, todas candidatas.
  - `package-lock.json`: mudança que já existia, fora do escopo.
- **Branches**:

  | Repo | Branch |
  | --- | --- |
  | `backend-promotor` | `feat/disparo-convite-visita-admin` |
  | `ob-ads` | `feat/disparo-convite-visita-admin` |
  | `jornalOficinaBrasil` | `feat/recusar-visita`, no worktree `../jornalOficinaBrasil-recusar-visita` (com `node_modules` em junction para o checkout principal) |
