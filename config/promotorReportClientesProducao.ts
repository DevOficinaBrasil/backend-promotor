/**
 * Allowlist fixa dos clientes que recebem o relatório semanal de promotores
 * em produção (CON26-325). Pós-Execute, AD-006 (.specs/STATE.md): SQL Server
 * em congelamento pré-migração pra Postgres, o DBA pediu pra não acrescentar
 * nada lá (nem a linha do módulo "promotores" em cliente_module). Enquanto
 * isso vigorar, "quem está habilitado" é hardcoded aqui, não na tabela.
 *
 * SKF = ID_CLIENTE 126 (SQL Server, TB_CLIENTE) — único cliente de fato
 * usando o módulo hoje. Reativar o fluxo escalável por módulo (T02-T07,
 * dormente) é trocar a origem dos clientes em
 * `PromotorReportService.processarClientesElegiveis` de volta pra
 * `ObAdsIntegrationClient.listarClientesHabilitados`, sem reescrever nada.
 */
export const CLIENTES_PRODUCAO_HABILITADOS: number[] = [126];
