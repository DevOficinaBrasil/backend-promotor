# Project State

## Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-13 | Zero-downtime migration com dual-connection | App não pode ficar offline, dados devem estar sempre acessíveis |
| 2026-07-13 | Apenas schema CAMPANHAS_OB precisa migrar | MAIN_REGISTER e dw já estão no banco correto (PRD) |
| 2026-07-13 | Banco antigo fica READ-ONLY para a app | Evita escritas divergentes durante transição |
| 2026-07-13 | Merge em memória (não via DB link) | Cross-region impede DB links nativos; volume baixo (<5k registros) permite merge em app |
| 2026-08-04 | Brownfield mapping executado | Base para próximas features; 7 docs em `.specs/codebase/` |
| 2026-08-07 | Migration da `NOTIFICACAO_VISITA` adequada ao `dba-rules` (review do DBA) | TEXT em vez de VARCHAR, TIMESTAMPTZ em vez de TIMESTAMP, `COMMENT ON` em tabela e colunas, CHECKs de negócio. Entity alinhada no mesmo commit |
| 2026-08-07 | CHECK de `STATUS` lista os 7 valores do enum, não os 4 propostos no review | `DISPENSADO` (supressão deliberada, não é falha) e `EXPIRADO` são gravados por code paths ativos — `envioGuards.ts` e as guardas de pré-envio. Com 4 valores, todo envio bloqueado por antispam estouraria constraint violation |
| 2026-08-07 | FK para `ROTA_PROMOTOR` **removida** — padrão da casa (relacionamento implícito) | Além da conformidade: a FK sem `ON DELETE` da v1 bloqueava qualquer `DELETE` em `ROTA_PROMOTOR` com notificação. A regra de negócio (1 notificação por rota) nunca dependeu dela — quem garante é o `UNIQUE(ID_ROTA_PROMOTOR)`, que fica. As relations do TypeORM não mudam: são join em tempo de query, e o data source roda `synchronize: false` |
| 2026-08-07 | Migration é de primeira execução, sem caminho de `ALTER` | O DBA cuida de prod, onde a tabela ainda não existe — não há dado antigo pra converter nem fuso a assumir. Dev é responsabilidade nossa e fica fora do arquivo versionado |

## Current Status

- **Phase**: Execução — código implementado
- **Completed**: Task 3.1, 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.2; brownfield mapping (2026-08-04)
- **Next**: Deploy com dual-mode (atualizar .env em produção) → Executar `npx ts-node scripts/migrate-data.ts` → Task 4.1
- **Blockers**:
  - ⛔ `scripts/migrate-data.ts` **não existe** — o "Next" acima não pode ser executado como está. Verificar se o script foi perdido ou nunca foi escrito.
  - ✅ ~~Suíte quebrada desde PR #39~~ — resolvido em `34216df`. Unit + integração de visita: 100% verde.
  - ⚠️ 3 suítes de integração legadas falham no teardown por FK: `rotaService`, `campanhaPromotorService`, `campanhaResultsService`. Causa comum e pré-existente — a cadeia `PROMOTOR → CAMPANHA_PROMOTOR → ROTA_PROMOTOR` tem FKs herdadas sem `ON DELETE`, e o cleanup dos testes deleta de cima pra baixo. O elo da `NOTIFICACAO_VISITA` sai quando a migration rodar; os demais são pré-existentes e ficam. Não é regressão da feature de visita.
  - ⏳ Migration da `NOTIFICACAO_VISITA` fechada e sem pendências de decisão, aguardando o DBA rodar em prod. O reset da tabela em dev (necessário porque a v1 subiu lá com o schema antigo) é manual e não versionado.

## Open Risks (do mapping de 2026-08-04)

Detalhe completo em `.specs/codebase/CONCERNS.md`. Requerem decisão do owner:

1. **Nenhuma rota tem autenticação** — `authMiddleware` existe mas nunca é importado; os 37 call sites passam `middlewares: []`. Confirmar se o ALB é público antes de classificar a severidade.
2. **`exemple.env` está versionado com credenciais reais** — senha RDS (mesma para PRD e legacy), chaves AWS, `JWT_SECRET` de 13 chars. Rotacionar; `.gitignore` não pega o padrão `exemple.env`.
3. **Senhas são cifradas de forma reversível (AES-256-CBC), não hasheadas** — `bcrypt` já está instalado e sem uso.
4. **Token do login não bate com o schema esperado pelo `authMiddleware`** — corrigir antes de montar a autenticação, senão todo login quebra.

## Lessons Learned

- Mock manual (`__mocks__/data-source.ts`) não acompanhou a mudança de `data-source.ts` no PR #39 e derrubou a suíte inteira. Sem CI, isso passou direto para a `main`. Ao alterar exports de `data-source.ts`, atualizar o mock no mesmo commit.
- Documentação em `docs/` divergiu do código em pelo menos dois pontos (enriquecimento DuckDB em `oficinaService`, comandos no `README.md`). Tratar doc como parte do commit que muda o comportamento.

## Deferred Ideas

- Monitoramento de drift entre bancos (se ficarem em dual-mode por muito tempo)
- Healthcheck endpoint que valida ambas as conexões
