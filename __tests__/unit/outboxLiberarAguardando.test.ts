import OutboxNotificacaoService from "../../service/outboxNotificacaoService";
import { AppDataSourceSync } from "../../data-source";
import { horarioNoDia } from "../../utils/agendamento";

jest.mock("../../data-source");
jest.mock("../../service/notificacaoVisitaService");

const normalizar = (sql: string) => sql.replace(/\s+/g, " ").trim();

// CONV-27: convite confirmado → as AGUARDANDO viram aceitas (CONVITE_VINCULADO).
// CONV-28: convite recusado → as AGUARDANDO viram RECUSADO.
// CONV-29: convite expirado (ou FALHOU/DISPENSADO) → reenfileiradas para a
// janela do dia seguinte, com a referência limpa.
// Com o banco mockado, a SQL é o comportamento: as asserções abaixo fixam cada
// ramo do CASE e do WHERE (L-004). Não prova a execução contra o Postgres (L-014).
describe("OutboxNotificacaoService.liberarAguardando", () => {
  const agora = new Date("2026-09-28T15:00:00.000Z");
  let query: jest.Mock;
  let envOriginal: string | undefined;

  beforeEach(() => {
    envOriginal = process.env.OUTBOX_VISITA_ENVIO_IMEDIATO;
    delete process.env.OUTBOX_VISITA_ENVIO_IMEDIATO;
    query = AppDataSourceSync.query as jest.Mock;
    query.mockReset();
    query.mockResolvedValue([[], 3]);
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    if (envOriginal === undefined) delete process.env.OUTBOX_VISITA_ENVIO_IMEDIATO;
    else process.env.OUTBOX_VISITA_ENVIO_IMEDIATO = envOriginal;
    jest.restoreAllMocks();
  });

  async function sqlExecutada() {
    await OutboxNotificacaoService.liberarAguardando(agora);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    return { sql: normalizar(sql), params };
  }

  it("atualiza só AGUARDANDO, casando a referência pela mesma tabela", async () => {
    const { sql } = await sqlExecutada();

    expect(sql).toContain(`UPDATE "CAMPANHAS_OB"."NOTIFICACAO_VISITA" n`);
    expect(sql).toContain(`FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA" ref`);
    expect(sql).toContain(`WHERE n."STATUS" = 'AGUARDANDO'`);
    expect(sql).toContain(`ref."ID_NOTIFICACAO_VISITA" = n."ID_NOTIFICACAO_REFERENCIA"`);
  });

  it("só toca referência resolvida: CONFIRMADO, RECUSADO, EXPIRADO, FALHOU, DISPENSADO ou ENVIADO vencido", async () => {
    const { sql } = await sqlExecutada();

    expect(sql).toContain(
      `ref."STATUS" IN ('CONFIRMADO', 'RECUSADO', 'EXPIRADO', 'FALHOU', 'DISPENSADO') OR (ref."STATUS" = 'ENVIADO' AND ref."EXPIRA_EM" < now())`
    );
  });

  it("referência CONFIRMADO → CONFIRMADO / CONVITE_VINCULADO com CONFIRMADO_EM = now()", async () => {
    const { sql } = await sqlExecutada();

    expect(sql).toContain(`WHEN 'CONFIRMADO' THEN 'CONFIRMADO'`);
    expect(sql).toContain(
      `"ORIGEM_ACEITE" = CASE WHEN ref."STATUS" = 'CONFIRMADO' THEN 'CONVITE_VINCULADO' ELSE n."ORIGEM_ACEITE" END`
    );
    expect(sql).toContain(
      `"CONFIRMADO_EM" = CASE WHEN ref."STATUS" = 'CONFIRMADO' THEN now() ELSE n."CONFIRMADO_EM" END`
    );
  });

  it("referência RECUSADO → RECUSADO com RECUSADO_EM = now()", async () => {
    const { sql } = await sqlExecutada();

    expect(sql).toContain(`WHEN 'RECUSADO' THEN 'RECUSADO'`);
    expect(sql).toContain(
      `"RECUSADO_EM" = CASE WHEN ref."STATUS" = 'RECUSADO' THEN now() ELSE n."RECUSADO_EM" END`
    );
  });

  it("demais referências → PENDENTE na próxima janela, com a referência limpa", async () => {
    const { sql, params } = await sqlExecutada();

    expect(sql).toContain(`ELSE 'PENDENTE' END`);
    expect(sql).toContain(
      `"AVAILABLE_AT" = CASE WHEN ref."STATUS" IN ('CONFIRMADO', 'RECUSADO') THEN NULL ELSE $1::timestamptz END`
    );
    expect(sql).toContain(
      `"ID_NOTIFICACAO_REFERENCIA" = CASE WHEN ref."STATUS" IN ('CONFIRMADO', 'RECUSADO') THEN n."ID_NOTIFICACAO_REFERENCIA" ELSE NULL END`
    );
    expect(params).toEqual([horarioNoDia(agora, 1, 0, 1)]);
    // A próxima janela é amanhã (America/Sao_Paulo), nunca hoje.
    expect((params[0] as Date).getTime()).toBeGreaterThan(agora.getTime());
  });

  it("devolve quantas linhas o UPDATE atingiu", async () => {
    await expect(OutboxNotificacaoService.liberarAguardando(agora)).resolves.toBe(3);
  });
});

describe("OutboxNotificacaoService.tick + liberarAguardando", () => {
  let liberar: jest.SpyInstance;
  let claim: jest.SpyInstance;

  beforeEach(() => {
    process.env.OUTBOX_VISITA_ENVIO_IMEDIATO = "1";
    liberar = jest.spyOn(OutboxNotificacaoService, "liberarAguardando").mockResolvedValue(0);
    claim = jest.spyOn(OutboxNotificacaoService, "claimBatch").mockResolvedValue([]);
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.OUTBOX_VISITA_ENVIO_IMEDIATO;
    jest.restoreAllMocks();
  });

  it("reconcilia antes do claim em cada tick", async () => {
    const agora = new Date("2026-09-28T15:00:00.000Z");

    await OutboxNotificacaoService.tick("", agora);
    await OutboxNotificacaoService.tick("", agora);

    expect(liberar).toHaveBeenCalledTimes(2);
    expect(liberar).toHaveBeenCalledWith(agora);
    expect(liberar.mock.invocationCallOrder[0]).toBeLessThan(claim.mock.invocationCallOrder[0]);
  });

  it("segue para o claim e não lança quando a reconciliação falha", async () => {
    liberar.mockRejectedValue(new Error("db down"));

    await expect(OutboxNotificacaoService.tick()).resolves.toBeUndefined();
    expect(claim).toHaveBeenCalledTimes(1);
  });
});
