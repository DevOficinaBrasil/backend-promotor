import { AppDataSourceSync } from "../../data-source";
import AdminDisparoService, { AdminDisparoErro } from "../../service/adminDisparoService";
import OficinaService from "../../service/oficinaService";
import SegmentacaoService from "../../service/segmentacaoService";
import GeolocationService from "../../service/geolocationService";

jest.mock("../../data-source");
jest.mock("../../service/oficinaService", () => {
  const real = jest.requireActual("../../service/oficinaService");
  return {
    __esModule: true,
    ...real,
    default: { buscarOficinasBase: jest.fn(), opcoesFiltroBusca: jest.fn(), cidadesPorUf: jest.fn() },
  };
});
jest.mock("../../service/segmentacaoService");
jest.mock("../../service/geolocationService");

const queryMock = AppDataSourceSync.query as jest.Mock;
const baseMock = OficinaService.buscarOficinasBase as jest.Mock;
const opcoesMock = OficinaService.opcoesFiltroBusca as jest.Mock;
const cidadesMock = OficinaService.cidadesPorUf as jest.Mock;

const campanha = { ID_CAMPANHA: 77, ID_CLIENT: 5, EMPRESA_SLUG: "zf", END_TIME: null };
const oficina = { ID_OFICINA: 10, semCoordenadas: false } as any;

beforeEach(() => {
  jest.clearAllMocks();
  queryMock.mockReset();
  queryMock.mockResolvedValue([campanha]);
  baseMock.mockResolvedValue({ oficinas: [oficina], truncado: false });
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

// T39 (CONV-06, CONV-08, CONV-11)
describe("AdminDisparoService.buscarOficinas", () => {
  it("sem filtro: busca a base inteira com o slug da campanha, sem CRM nem geocodificação", async () => {
    const r = await AdminDisparoService.buscarOficinas(77, {});

    expect(baseMock).toHaveBeenCalledWith({}, { idCampanha: 77, empresaSlug: "zf" });
    expect(r).toEqual({ oficinas: [oficina], truncado: false, total: 1 });
    expect(SegmentacaoService.previewContactsAll).not.toHaveBeenCalled();
    expect(SegmentacaoService.listFilterOptions).not.toHaveBeenCalled();
    expect(GeolocationService.prototype.getLatLongByCep).not.toHaveBeenCalled();
  });

  it("repassa os filtros validados e normalizados, e o truncado", async () => {
    baseMock.mockResolvedValue({ oficinas: [oficina], truncado: true });

    const r = await AdminDisparoService.buscarOficinas(77, {
      linhas: ["leve"],
      elevadoresMin: 2,
      uf: "sp",
      cidade: "Campinas",
    });

    expect(baseMock).toHaveBeenCalledWith(
      { linhas: ["LEVE"], elevadoresMin: 2, uf: "SP", cidade: "Campinas" },
      { idCampanha: 77, empresaSlug: "zf" }
    );
    expect(r.truncado).toBe(true);
  });

  it.each([
    [{ cidade: "Campinas" }, "Informe a UF para filtrar por cidade"],
    [{ uf: "SPA" }, "UF inválida"],
    [{ elevadoresMin: -1 }, "Quantidade de elevadores deve ser um inteiro maior ou igual a 0"],
  ])("%p → 400 %p sem consultar a base", async (filtros, mensagem) => {
    await expect(AdminDisparoService.buscarOficinas(77, filtros)).rejects.toMatchObject({
      status: 400,
      message: mensagem,
    });
    expect(queryMock).not.toHaveBeenCalled();
    expect(baseMock).not.toHaveBeenCalled();
  });

  it("campanha inexistente → 404 sem buscar", async () => {
    queryMock.mockResolvedValue([]);

    await expect(AdminDisparoService.buscarOficinas(999, {})).rejects.toMatchObject({ status: 404 });
    expect(baseMock).not.toHaveBeenCalled();
  });

  it("falha de consulta → 500 'Não foi possível buscar as oficinas'", async () => {
    baseMock.mockRejectedValue(new Error("connection terminated"));

    const erro = await AdminDisparoService.buscarOficinas(77, {}).catch((e) => e);

    expect(erro).toBeInstanceOf(AdminDisparoErro);
    expect(erro).toMatchObject({ status: 500, message: "Não foi possível buscar as oficinas" });
  });
});

// T39 (CONV-12)
describe("AdminDisparoService opções dos filtros", () => {
  it("listarFiltrosBusca devolve linhas e UFs da base", async () => {
    opcoesMock.mockResolvedValue({ linhas: ["Leve", "Moto"], ufs: ["SP"] });

    await expect(AdminDisparoService.listarFiltrosBusca()).resolves.toEqual({ linhas: ["Leve", "Moto"], ufs: ["SP"] });
  });

  it("listarCidades normaliza a UF e devolve só as cidades dela", async () => {
    cidadesMock.mockResolvedValue(["Campinas"]);

    await expect(AdminDisparoService.listarCidades(" sp ")).resolves.toEqual({ cidades: ["Campinas"] });
    expect(cidadesMock).toHaveBeenCalledWith("SP");
  });

  it.each([[undefined], [""], ["S"]])("listarCidades com UF %p → 400 UF inválida", async (uf) => {
    await expect(AdminDisparoService.listarCidades(uf)).rejects.toMatchObject({ status: 400, message: "UF inválida" });
    expect(cidadesMock).not.toHaveBeenCalled();
  });
});
