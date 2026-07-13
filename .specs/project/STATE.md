# Project State

## Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-13 | Zero-downtime migration com dual-connection | App não pode ficar offline, dados devem estar sempre acessíveis |
| 2026-07-13 | Apenas schema CAMPANHAS_OB precisa migrar | MAIN_REGISTER e dw já estão no banco correto (PRD) |
| 2026-07-13 | Banco antigo fica READ-ONLY para a app | Evita escritas divergentes durante transição |
| 2026-07-13 | Merge em memória (não via DB link) | Cross-region impede DB links nativos; volume baixo (<5k registros) permite merge em app |

## Current Status

- **Phase**: Execução — código implementado
- **Completed**: Task 3.1, 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.2
- **Next**: Deploy com dual-mode (atualizar .env em produção) → Executar `npx ts-node scripts/migrate-data.ts` → Task 4.1
- **Blockers**: Nenhum

## Lessons Learned

- (em branco — será preenchido durante execução)

## Deferred Ideas

- Monitoramento de drift entre bancos (se ficarem em dual-mode por muito tempo)
- Healthcheck endpoint que valida ambas as conexões
