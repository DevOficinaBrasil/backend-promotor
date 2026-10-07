# Tasks — freela-confirmacao-dados

| # | Task | Arquivos | Status |
|---|---|---|---|
| T1 | Migração da CHK de ORIGEM_ACEITE + enum `OrigemAceite` | scripts/migration-freelancer-origem-aceite.sql, entities/NotificacaoVisita.ts | feito |
| T2 | Helpers e schemas zod | utils/freelancerConfirmacao.ts, schemas/freelancerConfirmacao.ts | feito |
| T3 | Middleware de role FREELANCER | middlewares/freelancerRoleMiddleware.ts | feito |
| T4 | Service (listar, detalhe, usuário, confirmar transacional) | service/freelancerConfirmacaoService.ts | feito |
| T5 | Rotas + montagem em api.ts | routes/FreelancerConfirmacaoRoute.ts, api.ts | feito |
| T6 | Testes unitários com mocks (sem banco) | __tests__/unit/freelancerConfirmacao.test.ts | feito |

Verificação: `npx jest __tests__/unit/freelancerConfirmacao.test.ts` (54 testes), `npx tsc --noEmit` sem erro novo.
Pendente (humano): aplicar a migração; validar as queries contra um Postgres de dev.
