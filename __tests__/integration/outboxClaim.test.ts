import "./setup";
import { AppDataSourceSync } from "../../data-source";
import OutboxNotificacaoService from "../../service/outboxNotificacaoService";

/**
 * AGND-04 a AGND-08 e AGND-13.
 *
 * Integração de propósito: `FOR UPDATE SKIP LOCKED` é comportamento do banco,
 * não do código. Contra um data source mockado o teste afirmaria que uma string
 * de SQL contém as palavras certas, o que não prova nada sobre a garantia em que
 * a feature inteira se apoia — dois workers nunca pegam a mesma linha.
 *
 * As linhas de teste se penduram em rotas reais que ainda não têm notificação, e
 * são apagadas no afterAll — só as notificações criadas aqui, nunca as rotas.
 *
 * Cuidado: `claimBatch` é a query de produção e não tem como ser escopada por
 * teste. Se o banco alvo tiver notificações realmente enfileiradas e vencidas,
 * esta suíte pode reivindicá-las junto — o lease vence sozinho em 5 minutos, mas
 * o ATTEMPTS delas fica +1. Rodar só contra dev.
 *
 * Nota de ambiente: o banco de dev **tem** a FK
 * NOTIFICACAO_VISITA_ID_ROTA_PROMOTOR_fkey, que a decisão de 2026-08-07 em
 * .specs/project/STATE.md dá como removida e que o
 * scripts/migration-notificacao-visita.sql não cria. O schema de dev diverge do
 * versionado, então inventar ID_ROTA_PROMOTOR aqui estoura a FK.
 */
describe("OutboxNotificacaoService.claimBatch (integração)", () => {
  const idsCriados: number[] = [];
  let rotasLivres: number[] = [];

  beforeAll(async () => {
    const linhas = await AppDataSourceSync.query(
      `SELECT r."ID_ROTA_PROMOTOR"
         FROM "CAMPANHAS_OB"."ROTA_PROMOTOR" r
         LEFT JOIN "CAMPANHAS_OB"."NOTIFICACAO_VISITA" n
           ON n."ID_ROTA_PROMOTOR" = r."ID_ROTA_PROMOTOR"
        WHERE n."ID_NOTIFICACAO_VISITA" IS NULL
        ORDER BY r."ID_ROTA_PROMOTOR" DESC
        LIMIT 40`
    );
    rotasLivres = linhas.map((l: { ID_ROTA_PROMOTOR: number }) => Number(l.ID_ROTA_PROMOTOR));

    if (rotasLivres.length < 30) {
      throw new Error(
        `dev não tem rotas sem notificação suficientes para o teste (${rotasLivres.length})`
      );
    }
  });

  interface OpcoesLinha {
    status?: string;
    disponivelEm?: string | null;
    travadaEm?: string | null;
    tentativas?: number;
  }

  async function criarLinha(opcoes: OpcoesLinha = {}): Promise<number> {
    const {
      status = "PENDENTE",
      disponivelEm = "now() - interval '1 hour'",
      travadaEm = null,
      tentativas = 0,
    } = opcoes;

    const idRota = rotasLivres.pop();
    if (idRota === undefined) {
      throw new Error("acabaram as rotas livres reservadas para o teste");
    }

    const [linha] = await AppDataSourceSync.query(
      `INSERT INTO "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
         ("ID_ROTA_PROMOTOR", "CANAL", "STATUS", "AVAILABLE_AT", "LOCKED_AT", "ATTEMPTS")
       VALUES ($1, 'WHATSAPP', $2, ${disponivelEm ?? "NULL"}, ${travadaEm ?? "NULL"}, $3)
       RETURNING "ID_NOTIFICACAO_VISITA"`,
      [idRota, status, tentativas]
    );

    const id = Number(linha.ID_NOTIFICACAO_VISITA);
    idsCriados.push(id);
    return id;
  }

  async function lerLinha(id: number) {
    const [linha] = await AppDataSourceSync.query(
      `SELECT "STATUS", "ATTEMPTS", "LOCKED_BY", "LOCKED_AT", "AVAILABLE_AT"
         FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA"
        WHERE "ID_NOTIFICACAO_VISITA" = $1`,
      [id]
    );
    return linha;
  }

  afterAll(async () => {
    if (idsCriados.length > 0) {
      await AppDataSourceSync.query(
        `DELETE FROM "CAMPANHAS_OB"."NOTIFICACAO_VISITA" WHERE "ID_NOTIFICACAO_VISITA" = ANY($1)`,
        [idsCriados]
      );
    }
  });

  // AGND-05: a garantia central. Dois workers concorrentes recebem conjuntos
  // disjuntos, e é isso que torna copiar o servidor inofensivo.
  it("hands two concurrent workers disjoint id sets", async () => {
    const ids = await Promise.all(Array.from({ length: 10 }, () => criarLinha()));

    const [primeiro, segundo] = await Promise.all([
      OutboxNotificacaoService.claimBatch(10, "worker-A"),
      OutboxNotificacaoService.claimBatch(10, "worker-B"),
    ]);

    const meus = new Set(ids);
    const doPrimeiro = primeiro.filter((id) => meus.has(id));
    const doSegundo = segundo.filter((id) => meus.has(id));
    const intersecao = doPrimeiro.filter((id) => doSegundo.includes(id));

    expect(intersecao).toEqual([]);
    expect(new Set([...doPrimeiro, ...doSegundo]).size).toBe(
      doPrimeiro.length + doSegundo.length
    );
    expect(doPrimeiro.length + doSegundo.length).toBeGreaterThan(0);
  });

  // AGND-06: tentativa é contada no claim, não no fim do despacho.
  it("stamps the worker id and increments ATTEMPTS in the claim itself", async () => {
    const id = await criarLinha({ tentativas: 0 });

    const reivindicados = await OutboxNotificacaoService.claimBatch(50, "worker-carimbo");

    expect(reivindicados).toContain(id);
    const linha = await lerLinha(id);
    expect(linha.ATTEMPTS).toBe(1);
    expect(linha.LOCKED_BY).toBe("worker-carimbo");
    expect(linha.LOCKED_AT).not.toBeNull();
  });

  // AGND-13: a borda mais perigosa da migração. Linha anterior ao outbox tem
  // AVAILABLE_AT nulo e já foi despachada inline — reivindicá-la reenviaria
  // histórico para oficina real no primeiro deploy.
  it("never claims a row with a null AVAILABLE_AT", async () => {
    const id = await criarLinha({ disponivelEm: null });

    const reivindicados = await OutboxNotificacaoService.claimBatch(50, "worker-nulo");

    expect(reivindicados).not.toContain(id);
    const linha = await lerLinha(id);
    expect(linha.ATTEMPTS).toBe(0);
    expect(linha.LOCKED_BY).toBeNull();
  });

  // AGND-04: vencimento é do banco. Linha marcada para o futuro não sai antes.
  it("does not claim a row scheduled for the future", async () => {
    const id = await criarLinha({ disponivelEm: "now() + interval '2 hours'" });

    const reivindicados = await OutboxNotificacaoService.claimBatch(50, "worker-futuro");

    expect(reivindicados).not.toContain(id);
  });

  it("does not claim a row whose lease is still held", async () => {
    const id = await criarLinha({ travadaEm: "now() - interval '10 seconds'" });

    const reivindicados = await OutboxNotificacaoService.claimBatch(50, "worker-lease");

    expect(reivindicados).not.toContain(id);
  });

  // AGND-08: worker morto no meio do despacho não prende a linha para sempre.
  it("reclaims a row whose lease has expired", async () => {
    const id = await criarLinha({ travadaEm: "now() - interval '30 minutes'" });

    const reivindicados = await OutboxNotificacaoService.claimBatch(50, "worker-retomada");

    expect(reivindicados).toContain(id);
    const linha = await lerLinha(id);
    expect(linha.LOCKED_BY).toBe("worker-retomada");
  });

  // AGND-09/AGND-10: status terminal nunca volta para a fila.
  it.each([["ENVIADO"], ["CONFIRMADO"], ["FALHOU"], ["DISPENSADO"], ["EXPIRADO"]])(
    "never claims a row already in %s",
    async (status) => {
      const id = await criarLinha({ status });

      const reivindicados = await OutboxNotificacaoService.claimBatch(50, "worker-terminal");

      expect(reivindicados).not.toContain(id);
    }
  );

  // AGND-04: o lote é limitado; um lote da manhã grande escoa em vários ticks.
  it("claims no more than the requested batch size", async () => {
    await Promise.all(Array.from({ length: 5 }, () => criarLinha()));

    const reivindicados = await OutboxNotificacaoService.claimBatch(3, "worker-lote");

    expect(reivindicados.length).toBeLessThanOrEqual(3);
  });

  it("claims nothing for a non-positive batch size, without touching the database", async () => {
    const id = await criarLinha();

    const reivindicados = await OutboxNotificacaoService.claimBatch(0, "worker-zero");

    expect(reivindicados).toEqual([]);
    const linha = await lerLinha(id);
    expect(linha.ATTEMPTS).toBe(0);
  });

  // AGND-04: mais velho primeiro, para o lote da manhã escoar em ordem.
  it("claims the oldest AVAILABLE_AT first", async () => {
    const antigo = await criarLinha({ disponivelEm: "now() - interval '10 days'" });
    await criarLinha({ disponivelEm: "now() - interval '9 days'" });

    const reivindicados = await OutboxNotificacaoService.claimBatch(1, "worker-ordem");

    expect(reivindicados).toEqual([antigo]);
  });
});
