import { AppDataSourceSync } from "../../data-source";
import AdminDisparoService, {
  MAX_CONTATOS_SEGMENTACAO,
  PRAZO_CRM_MS,
  TENANT_OFICINA_BRASIL,
} from "../../service/adminDisparoService";
import SegmentacaoService from "../../service/segmentacaoService";
import OficinaService from "../../service/oficinaService";
import GeolocationService from "../../service/geolocationService";

jest.mock("../../data-source");
jest.mock("../../service/segmentacaoService");
jest.mock("../../service/oficinaService");
jest.mock("../../service/geolocationService");

// T17 (CONV-06, CONV-07, CONV-08, CONV-10, CONV-11, CONV-12)
describe("AdminDisparoService.segmentarOficinas", () => {
  const dsl = { if: { behavior: {} }, then: { decision: "include" }, default: { decision: "exclude" } };
  const campanha = { ID_CAMPANHA: 77, ID_CLIENT: 5, EMPRESA_SLUG: "zf", END_TIME: null };
  const oficina = { ID_OFICINA: 10 } as any;

  const previewMock = SegmentacaoService.previewContactsAll as jest.Mock;
  const validateMock = SegmentacaoService.validateDsl as jest.Mock;
  const baseMock = OficinaService.getOficinasBaseSegmentadas as jest.Mock;
  const cepMock = GeolocationService.prototype.getLatLongByCep as jest.Mock;
  const queryMock = AppDataSourceSync.query as jest.Mock;

  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([campanha]);
    validateMock.mockReturnValue({ valid: true });
    previewMock.mockResolvedValue({ externalUserIds: [1, 2], estimatedCount: 2, truncado: false, paginas: 1 });
    baseMock.mockResolvedValue([oficina]);
    cepMock.mockResolvedValue({ lat: -22.9, long: -47.06 });
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each([
    ["sem região", undefined],
    ["UF sem cidade", { uf: "SP", cidade: " " }],
    ["CEP sem raio", { cep: "13000000" }],
    ["raio zero", { cep: "13000000", raioKm: 0 }],
    ["raio negativo", { cep: "13000000", raioKm: -5 }],
  ])("%s → 400 com a mensagem da spec, sem consultar o CRM", async (_, regiao) => {
    await expect(AdminDisparoService.segmentarOficinas(77, regiao, dsl)).rejects.toMatchObject({
      status: 400,
      message: "Informe a região (UF e cidade, ou CEP e raio)",
    });
    expect(previewMock).not.toHaveBeenCalled();
  });

  it.each([
    ["DSL ausente", undefined],
    ["DSL nula", null],
    ["DSL vazia", {}],
  ])("%s → 400 'Informe ao menos um critério de segmentação', sem consultar o CRM", async (_, filtro) => {
    await expect(
      AdminDisparoService.segmentarOficinas(77, { uf: "SP", cidade: "Campinas" }, filtro)
    ).rejects.toMatchObject({ status: 400, message: "Informe ao menos um critério de segmentação" });
    expect(previewMock).not.toHaveBeenCalled();
  });

  it("DSL malformada → 400 com os erros do validador, sem consultar o CRM", async () => {
    validateMock.mockReturnValue({ valid: false, errors: ["if.behavior is invalid"] });

    await expect(
      AdminDisparoService.segmentarOficinas(77, { uf: "SP", cidade: "Campinas" }, { if: {} })
    ).rejects.toMatchObject({
      status: 400,
      message: "Filtro de segmentação inválido.",
      extra: { details: ["if.behavior is invalid"] },
    });
    expect(previewMock).not.toHaveBeenCalled();
  });

  it("CEP sem coordenada → 400 'CEP não encontrado', sem consultar o CRM", async () => {
    cepMock.mockResolvedValue(null);

    await expect(
      AdminDisparoService.segmentarOficinas(77, { cep: "00000000", raioKm: 10 }, dsl)
    ).rejects.toMatchObject({ status: 400, message: "CEP não encontrado" });
    expect(previewMock).not.toHaveBeenCalled();
  });

  it("chama o CRM no tenant 15 com teto de 5000, nunca o tenant da campanha", async () => {
    await AdminDisparoService.segmentarOficinas(77, { uf: "SP", cidade: "Campinas" }, dsl);

    expect(TENANT_OFICINA_BRASIL).toBe(15);
    expect(MAX_CONTATOS_SEGMENTACAO).toBe(5000);
    expect(previewMock).toHaveBeenCalledWith(dsl, 15, 5000);
    expect(SegmentacaoService.resolveTenantIdByCampanha).not.toHaveBeenCalled();
    expect(SegmentacaoService.resolveTenantId).not.toHaveBeenCalled();
  });

  it("UF + cidade: repassa a região e o slug da campanha para a base e devolve as oficinas", async () => {
    const r = await AdminDisparoService.segmentarOficinas(77, { uf: "SP", cidade: "Campinas" }, dsl);

    expect(baseMock).toHaveBeenCalledWith([1, 2], { uf: "SP", cidade: "Campinas" }, { idCampanha: 77, empresaSlug: "zf" });
    expect(r).toEqual({ oficinas: [oficina], truncado: false, total: 1 });
  });

  it("CEP + raio: converte o CEP em centro e repassa o raio", async () => {
    await AdminDisparoService.segmentarOficinas(77, { cep: "13000-000", raioKm: 30 }, dsl);

    expect(cepMock).toHaveBeenCalledWith("13000-000");
    expect(baseMock).toHaveBeenCalledWith([1, 2], { lat: -22.9, lon: -47.06, raioKm: 30 }, { idCampanha: 77, empresaSlug: "zf" });
  });

  it("repassa truncado: true quando a varredura atinge o teto (CONV-10)", async () => {
    previewMock.mockResolvedValue({ externalUserIds: [1], estimatedCount: 9000, truncado: true, paginas: 50 });

    const r = await AdminDisparoService.segmentarOficinas(77, { uf: "SP", cidade: "Campinas" }, dsl);

    expect(r.truncado).toBe(true);
  });

  it("falha do CRM → 502 'Segmentação indisponível'", async () => {
    previewMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      AdminDisparoService.segmentarOficinas(77, { uf: "SP", cidade: "Campinas" }, dsl)
    ).rejects.toMatchObject({ status: 502, message: "Segmentação indisponível" });
    expect(baseMock).not.toHaveBeenCalled();
  });

  it("CRM que excede o prazo → 502 'Segmentação indisponível'", async () => {
    jest.useFakeTimers();
    previewMock.mockReturnValue(new Promise(() => {}));

    const promessa = AdminDisparoService.segmentarOficinas(77, { uf: "SP", cidade: "Campinas" }, dsl);
    const verificacao = expect(promessa).rejects.toMatchObject({ status: 502, message: "Segmentação indisponível" });
    await jest.advanceTimersByTimeAsync(PRAZO_CRM_MS + 1);
    await verificacao;
  });

  it("campanha inexistente → 404", async () => {
    queryMock.mockResolvedValue([]);

    await expect(
      AdminDisparoService.segmentarOficinas(999, { uf: "SP", cidade: "Campinas" }, dsl)
    ).rejects.toMatchObject({ status: 404 });
    expect(previewMock).not.toHaveBeenCalled();
  });
});

// T17 (CONV-12): campos e valores do tenant 15, não do tenant da campanha.
describe("AdminDisparoService campos e valores de segmentação", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("listarCamposSegmentacao lê as opções do tenant 15", async () => {
    const opcoes = { fieldOptionArray: [{ path: "contactAttributes.gender", label: "Gênero" }] };
    (SegmentacaoService.listFilterOptions as jest.Mock).mockResolvedValue(opcoes);

    await expect(AdminDisparoService.listarCamposSegmentacao()).resolves.toEqual(opcoes);
    expect(SegmentacaoService.listFilterOptions).toHaveBeenCalledWith(15);
  });

  it("listarCamposSegmentacao com CRM fora do ar → 502", async () => {
    (SegmentacaoService.listFilterOptions as jest.Mock).mockRejectedValue(new Error("down"));

    await expect(AdminDisparoService.listarCamposSegmentacao()).rejects.toMatchObject({
      status: 502,
      message: "Segmentação indisponível",
    });
  });

  it("listarValoresCampo lê os valores do tenant 15", async () => {
    const valores = [{ valor: "Masculino", contatos: 3 }];
    (SegmentacaoService.valoresDeCampo as jest.Mock).mockResolvedValue(valores);

    await expect(AdminDisparoService.listarValoresCampo("contactAttributes.gender")).resolves.toEqual(valores);
    expect(SegmentacaoService.valoresDeCampo).toHaveBeenCalledWith(15, "contactAttributes.gender");
  });
});
