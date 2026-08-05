# Project State

## Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-13 | Zero-downtime migration com dual-connection | App não pode ficar offline, dados devem estar sempre acessíveis |
| 2026-07-13 | Apenas schema CAMPANHAS_OB precisa migrar | MAIN_REGISTER e dw já estão no banco correto (PRD) |
| 2026-07-13 | Banco antigo fica READ-ONLY para a app | Evita escritas divergentes durante transição |
| 2026-07-13 | Merge em memória (não via DB link) | Cross-region impede DB links nativos; volume baixo (<5k registros) permite merge em app |
| 2026-08-04 | Brownfield mapping executado | Base para próximas features; 7 docs em `.specs/codebase/` |

## Current Status

- **Phase**: Execução — código implementado
- **Completed**: Task 3.1, 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.2; brownfield mapping (2026-08-04)
- **Next**: Deploy com dual-mode (atualizar .env em produção) → Executar `npx ts-node scripts/migrate-data.ts` → Task 4.1
- **Blockers**:
  - ⛔ `scripts/migrate-data.ts` **não existe** — o "Next" acima não pode ser executado como está. Verificar se o script foi perdido ou nunca foi escrito.
  - ⚠️ Suíte de testes quebrada desde PR #39 (31/41 falhando). Causa: `__mocks__/data-source.ts` não exporta `isLegacyEnabled`/`LegacyDataSource`. Ver `.specs/codebase/TESTING.md`.

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
