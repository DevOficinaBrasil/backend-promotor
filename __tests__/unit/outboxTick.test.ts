import OutboxNotificacaoService, {
  piorCasoPorLinhaMs,
  tamanhoLoteSeguro,
} from "../../service/outboxNotificacaoService";
import NotificacaoVisitaService, { criarCacheCampanha } from "../../service/notificacaoVisitaService";
import { AppDataSourceSync } from "../../data-source";

jest.mock("../../data-source");
jest.mock("../../service/notificacaoVisitaService");

// AGND-12, AGND-14, AGND-20: one tick claims a bounded batch, dispatches each
// row in isolation, routes the verdict to the right mark helper, and never
// throws at the process hosting it.
describe("OutboxNotificacaoService.tick", () => {
  const despachar = NotificacaoVisitaService.despacharNotificacao as jest.Mock;
  const criarCache = criarCacheCampanha as jest.Mock;

  /** O cache de lote, para as asserções compararem identidade e não forma. */
  const cacheDoLote = { dados: new Map(), nomeEmpresa: new Map() };

  /**
   * O claim devolve id, tentativas e rota — a fila não relê a linha só para saber
   * em que tentativa está.
   */
  const reivindicada = (id: number, tentativas = 1, idRota = 9) => ({ id, tentativas, idRota });

  let claimBatch: jest.SpyInstance;
  let marcarEnviado: jest.SpyInstance;
  let marcarRetentativa: jest.SpyInstance;
  let marcarFalhou: jest.SpyInstance;
  let liberarLease: jest.SpyInstance;
  let envOriginal: Record<string, string | undefined>;
  const ENV_KEYS = [
    "OUTBOX_VISITA_BATCH_SIZE",
    "OUTBOX_VISITA_MAX_ATTEMPTS",
    "OUTBOX_VISITA_LOCK_LEASE_MINUTES",
    "OUTBOX_VISITA_CONCURRENCY",
    "OUTBOX_VISITA_ENVIO_IMEDIATO",
    "NOTIFICACAO_HORA_ENVIO",
    "NOTIFICACAO_HORA_ENVIO_FIM",
  ] as const;

  beforeEach(() => {
    envOriginal = {};
    for (const chave of ENV_KEYS) {
      envOriginal[chave] = process.env[chave];
      delete process.env[chave];
    }

    // A guarda de horário comercial vale no despacho; estes testes são sobre o
    // resto do tique, então rodam com a chave de envio imediato, que a dispensa.
    process.env.OUTBOX_VISITA_ENVIO_IMEDIATO = "1";
    criarCache.mockReturnValue(cacheDoLote);
    claimBatch = jest.spyOn(OutboxNotificacaoService, "claimBatch").mockResolvedValue([]);
    marcarEnviado = jest.spyOn(OutboxNotificacaoService, "marcarEnviado").mockResolvedValue();
    marcarRetentativa = jest
      .spyOn(OutboxNotificacaoService, "marcarRetentativa")
      .mockResolvedValue();
    marcarFalhou = jest.spyOn(OutboxNotificacaoService, "marcarFalhou").mockResolvedValue();
    liberarLease = jest.spyOn(OutboxNotificacaoService, "liberarLease").mockResolvedValue();

    (AppDataSourceSync.getRepository as jest.Mock) = jest.fn(() => ({
      findOne: jest.fn(async () => ({ ID_NOTIFICACAO_VISITA: 1, ATTEMPTS: 1, ID_ROTA_PROMOTOR: 9 })),
    }));

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    for (const chave of ENV_KEYS) {
      if (envOriginal[chave] === undefined) {
        delete process.env[chave];
      } else {
        process.env[chave] = envOriginal[chave];
      }
    }
    jest.restoreAllMocks();
  });

  it("claims nothing more than the configured batch size", async () => {
    process.env.OUTBOX_VISITA_BATCH_SIZE = "7";

    await OutboxNotificacaoService.tick();

    expect(claimBatch).toHaveBeenCalledWith(7, expect.stringContaining("outbox-visita"));
  });

  // Um tique manual não pode se disfarçar de cron em LOCKED_BY.
  it("stamps the worker suffix it was given", async () => {
    await OutboxNotificacaoService.tick("-cli");

    expect(claimBatch).toHaveBeenCalledWith(20, expect.stringContaining("outbox-visita-cli-"));
  });

  it("does not dispatch when nothing is due", async () => {
    claimBatch.mockResolvedValue([]);

    await OutboxNotificacaoService.tick();

    expect(despachar).not.toHaveBeenCalled();
  });

  it("dispatches every claimed row", async () => {
    claimBatch.mockResolvedValue([reivindicada(1), reivindicada(2), reivindicada(3)]);
    despachar.mockResolvedValue({ desfecho: "ENVIADO", messageId: "m", providerMessageId: "p" });

    await OutboxNotificacaoService.tick();

    expect(despachar).toHaveBeenCalledTimes(3);
    expect(despachar).toHaveBeenCalledWith(1, cacheDoLote);
    expect(despachar).toHaveBeenCalledWith(2, cacheDoLote);
    expect(despachar).toHaveBeenCalledWith(3, cacheDoLote);
  });

  it("records a successful dispatch with its provider identifiers", async () => {
    claimBatch.mockResolvedValue([reivindicada(42)]);
    despachar.mockResolvedValue({
      desfecho: "ENVIADO",
      messageId: "msg-9",
      providerMessageId: "wamid.9",
    });

    await OutboxNotificacaoService.tick();

    expect(marcarEnviado).toHaveBeenCalledWith(42, "msg-9", "wamid.9");
  });

  it("only releases the lease for a suppressed notification", async () => {
    claimBatch.mockResolvedValue([reivindicada(42)]);
    despachar.mockResolvedValue({ desfecho: "DISPENSADO", motivo: "address recently updated" });

    await OutboxNotificacaoService.tick();

    expect(liberarLease).toHaveBeenCalledWith(42);
    expect(marcarFalhou).not.toHaveBeenCalled();
    expect(marcarRetentativa).not.toHaveBeenCalled();
  });

  it("only releases the lease for a terminal failure the dispatch already persisted", async () => {
    claimBatch.mockResolvedValue([reivindicada(42)]);
    despachar.mockResolvedValue({ desfecho: "FALHOU_TERMINAL", erro: "invalid phone" });

    await OutboxNotificacaoService.tick();

    expect(liberarLease).toHaveBeenCalledWith(42);
    expect(marcarFalhou).not.toHaveBeenCalled();
  });

  it("schedules a retry with backoff while below the ceiling", async () => {
    claimBatch.mockResolvedValue([reivindicada(42)]);
    despachar.mockResolvedValue({ desfecho: "FALHOU_TRANSITORIO", erro: "network error" });

    await OutboxNotificacaoService.tick();

    // ATTEMPTS is 1 on the loaded row, so the ladder's first step: no wait.
    expect(marcarRetentativa).toHaveBeenCalledWith(42, "network error", 0);
    expect(marcarFalhou).not.toHaveBeenCalled();
  });

  it("retires a transient failure once the attempt ceiling is reached", async () => {
    // A tentativa em curso vem do próprio claim, que já incrementou ATTEMPTS.
    claimBatch.mockResolvedValue([reivindicada(42, 3)]);
    despachar.mockResolvedValue({ desfecho: "FALHOU_TRANSITORIO", erro: "network error" });

    await OutboxNotificacaoService.tick();

    expect(marcarFalhou).toHaveBeenCalledWith(42, "network error");
    expect(marcarRetentativa).not.toHaveBeenCalled();
  });

  // One bad row must not cost the rest of the batch.
  it("keeps dispatching the batch when one row throws", async () => {
    claimBatch.mockResolvedValue([reivindicada(1), reivindicada(2), reivindicada(3)]);
    despachar
      .mockResolvedValueOnce({ desfecho: "ENVIADO", messageId: "a", providerMessageId: "b" })
      .mockRejectedValueOnce(new Error("linha explodiu"))
      .mockResolvedValueOnce({ desfecho: "ENVIADO", messageId: "c", providerMessageId: "d" });

    await OutboxNotificacaoService.tick();

    expect(despachar).toHaveBeenCalledTimes(3);
    expect(marcarEnviado).toHaveBeenCalledTimes(2);
  });

  it("treats a row that throws as a transient failure, so it is retried", async () => {
    claimBatch.mockResolvedValue([reivindicada(5)]);
    despachar.mockRejectedValue(new Error("linha explodiu"));

    await OutboxNotificacaoService.tick();

    expect(marcarRetentativa).toHaveBeenCalledWith(5, expect.stringContaining("linha explodiu"), 0);
  });

  // AGND-12: the tick runs inside the API process; it may never take it down.
  it("never throws when the claim itself fails", async () => {
    claimBatch.mockRejectedValue(new Error("banco fora"));

    await expect(OutboxNotificacaoService.tick()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("falha no tick"),
      expect.objectContaining({ erro: "banco fora" })
    );
  });

  it("never throws when a mark helper fails", async () => {
    claimBatch.mockResolvedValue([reivindicada(1)]);
    despachar.mockResolvedValue({ desfecho: "ENVIADO", messageId: "m", providerMessageId: "p" });
    marcarEnviado.mockRejectedValue(new Error("update falhou"));

    await expect(OutboxNotificacaoService.tick()).resolves.toBeUndefined();
  });

  // AGND-14: both ids on every outcome, so a queue problem is traceable.
  it("logs the claim count and each row outcome with both ids", async () => {
    claimBatch.mockResolvedValue([reivindicada(42)]);
    despachar.mockResolvedValue({ desfecho: "ENVIADO", messageId: "m", providerMessageId: "p" });

    await OutboxNotificacaoService.tick();

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("reivindicadas"),
      expect.objectContaining({ quantidade: 1 })
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("desfecho"),
      expect.objectContaining({
        ID_NOTIFICACAO_VISITA: 42,
        ID_ROTA_PROMOTOR: 9,
        acao: "ENVIADO",
      })
    );
  });
  // O tick despacha em série e cada envio pode levar até o timeout do canal. Um
  // lote que não caiba no lease deixa as linhas do fim vencerem enquanto o worker
  // ainda trabalha: outro worker as reivindica e a oficina recebe duas mensagens.
  // Antes, lote, timeout e lease eram três números sem relação nenhuma.
  describe("lote limitado pelo lease", () => {
    // Com N linhas em paralelo o lote leva ceil(lote / N) ondas, então o teto
    // acompanha a concorrência configurada.
    const teto = (leaseMinutos: number, concorrencia = 4) =>
      Math.floor((leaseMinutos * 60_000 * 0.8 * concorrencia) / piorCasoPorLinhaMs());

    it("mantém o lote padrão: nos valores de fábrica nada é cortado", () => {
      expect(tamanhoLoteSeguro()).toBe(20);
      expect(teto(5)).toBe(80);
    });

    it("corta o lote configurado acima do que cabe no lease", async () => {
      process.env.OUTBOX_VISITA_BATCH_SIZE = "200";

      await OutboxNotificacaoService.tick();

      expect(claimBatch).toHaveBeenCalledWith(teto(5), expect.any(String));
      expect(claimBatch).not.toHaveBeenCalledWith(200, expect.any(String));
    });

    it("corta mais fundo quando a concorrência cai para 1", async () => {
      process.env.OUTBOX_VISITA_BATCH_SIZE = "200";
      process.env.OUTBOX_VISITA_CONCURRENCY = "1";

      await OutboxNotificacaoService.tick();

      expect(claimBatch).toHaveBeenCalledWith(teto(5, 1), expect.any(String));
    });

    it("permite o lote grande quando o lease acompanha", async () => {
      process.env.OUTBOX_VISITA_BATCH_SIZE = "60";
      process.env.OUTBOX_VISITA_LOCK_LEASE_MINUTES = "5";

      await OutboxNotificacaoService.tick();

      expect(claimBatch).toHaveBeenCalledWith(60, expect.any(String));
    });

    it("nunca desce abaixo de uma linha, mesmo com lease minúsculo e sem paralelismo", () => {
      process.env.OUTBOX_VISITA_BATCH_SIZE = "20";
      process.env.OUTBOX_VISITA_LOCK_LEASE_MINUTES = "1";
      process.env.OUTBOX_VISITA_CONCURRENCY = "1";

      expect(tamanhoLoteSeguro()).toBe(Math.max(1, teto(1, 1)));
      expect(tamanhoLoteSeguro()).toBeGreaterThanOrEqual(1);
      expect(tamanhoLoteSeguro()).toBeLessThan(20);
    });

    it("registra o corte, para o valor configurado não sumir em silêncio", async () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      process.env.OUTBOX_VISITA_BATCH_SIZE = "200";

      tamanhoLoteSeguro();

      expect(warn).toHaveBeenCalledWith(
        "[outboxNotificacao] lote reduzido para caber no lease",
        expect.objectContaining({ OUTBOX_VISITA_BATCH_SIZE: 200, loteUsado: teto(5) })
      );
    });
  });
  // Perf: as linhas de um lote costumam ser da mesma campanha, e cada despacho
  // reresolvia CampanhaPromotor, Campanha e Community. O cache é por lote —
  // longo demais envelheceria contra o END_TIME da campanha.
  describe("cache e concorrência do lote", () => {
    it("cria um único cache e passa o mesmo para todas as linhas", async () => {
      claimBatch.mockResolvedValue([reivindicada(1), reivindicada(2), reivindicada(3)]);
      despachar.mockResolvedValue({ desfecho: "ENVIADO", messageId: "m", providerMessageId: "p" });

      await OutboxNotificacaoService.tick();

      expect(criarCache).toHaveBeenCalledTimes(1);
      const caches = despachar.mock.calls.map((chamada: unknown[]) => chamada[1]);
      expect(new Set(caches).size).toBe(1);
    });

    it("não relê a linha para descobrir a tentativa: o claim já disse", async () => {
      const findOne = jest.fn();
      (AppDataSourceSync.getRepository as jest.Mock) = jest.fn(() => ({ findOne }));
      claimBatch.mockResolvedValue([reivindicada(7, 2)]);
      despachar.mockResolvedValue({ desfecho: "FALHOU_TRANSITORIO", erro: "network error" });

      await OutboxNotificacaoService.tick();

      expect(findOne).not.toHaveBeenCalled();
      // Tentativa 2 ainda está abaixo do teto: retentativa com o backoff do degrau.
      expect(marcarRetentativa).toHaveBeenCalledWith(7, "network error", 15_000);
    });

    it("despacha em paralelo até a concorrência configurada", async () => {
      process.env.OUTBOX_VISITA_CONCURRENCY = "2";
      claimBatch.mockResolvedValue([1, 2, 3, 4].map((id) => reivindicada(id)));

      let emVoo = 0;
      let picoEmVoo = 0;
      despachar.mockImplementation(async () => {
        emVoo += 1;
        picoEmVoo = Math.max(picoEmVoo, emVoo);
        await new Promise((resolve) => setImmediate(resolve));
        emVoo -= 1;
        return { desfecho: "ENVIADO", messageId: "m", providerMessageId: "p" };
      });

      await OutboxNotificacaoService.tick();

      expect(despachar).toHaveBeenCalledTimes(4);
      expect(picoEmVoo).toBe(2);
    });

    it("serializa quando a concorrência é 1", async () => {
      process.env.OUTBOX_VISITA_CONCURRENCY = "1";
      claimBatch.mockResolvedValue([1, 2, 3].map((id) => reivindicada(id)));

      let emVoo = 0;
      let picoEmVoo = 0;
      despachar.mockImplementation(async () => {
        emVoo += 1;
        picoEmVoo = Math.max(picoEmVoo, emVoo);
        await new Promise((resolve) => setImmediate(resolve));
        emVoo -= 1;
        return { desfecho: "ENVIADO", messageId: "m", providerMessageId: "p" };
      });

      await OutboxNotificacaoService.tick();

      expect(picoEmVoo).toBe(1);
    });
  });
  // Mensagem de madrugada é o que o destinatário bloqueia e denuncia, e é bloqueio
  // e denúncia que derruba a qualidade do número na Meta. `AVAILABLE_AT` é decidido
  // na criação da rota, então backlog (lote limitado, tique espaçado, provider
  // lento) deixava linha vencida para sair no primeiro tique seguinte, hora nenhuma.
  describe("janela de horário comercial no despacho", () => {
    const dentro = new Date("2026-08-05T13:00:00.000Z"); // 10:00 em São Paulo
    const fora = new Date("2026-08-05T06:00:00.000Z"); // 03:00 em São Paulo

    beforeEach(() => {
      delete process.env.OUTBOX_VISITA_ENVIO_IMEDIATO;
      process.env.NOTIFICACAO_HORA_ENVIO = "9";
      process.env.NOTIFICACAO_HORA_ENVIO_FIM = "18";
      claimBatch.mockResolvedValue([reivindicada(1)]);
      despachar.mockResolvedValue({ desfecho: "ENVIADO", messageId: "m", providerMessageId: "p" });
    });

    it("não reivindica nada fora da janela: a linha nem queima tentativa", async () => {
      await OutboxNotificacaoService.tick("", fora);

      expect(claimBatch).not.toHaveBeenCalled();
      expect(despachar).not.toHaveBeenCalled();
    });

    it("despacha normalmente dentro da janela", async () => {
      await OutboxNotificacaoService.tick("", dentro);

      expect(claimBatch).toHaveBeenCalledTimes(1);
      expect(despachar).toHaveBeenCalledTimes(1);
    });

    it("usa a janela de São Paulo, não o fuso do processo", async () => {
      // 21:00 UTC é 18:00 em São Paulo: fim da janela, já fora.
      await OutboxNotificacaoService.tick("", new Date("2026-08-05T21:00:00.000Z"));

      expect(claimBatch).not.toHaveBeenCalled();
    });

    it("sem hora de fim configurada, vale a hora de início inteira", async () => {
      delete process.env.NOTIFICACAO_HORA_ENVIO_FIM;

      // 12:00 UTC = 09:00 em São Paulo, dentro; 13:00 UTC = 10:00, já fora.
      await OutboxNotificacaoService.tick("", new Date("2026-08-05T12:30:00.000Z"));
      expect(claimBatch).toHaveBeenCalledTimes(1);

      await OutboxNotificacaoService.tick("", new Date("2026-08-05T13:30:00.000Z"));
      expect(claimBatch).toHaveBeenCalledTimes(1);
    });

    it("a chave de envio imediato dispensa a janela, para teste local", async () => {
      process.env.OUTBOX_VISITA_ENVIO_IMEDIATO = "1";

      await OutboxNotificacaoService.tick("", fora);

      expect(claimBatch).toHaveBeenCalledTimes(1);
    });
  });
});
