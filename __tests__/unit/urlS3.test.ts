import { urlS3 } from "../../utils/urlS3";

const BASE = "https://oficina-brasil-public.s3.sa-east-1.amazonaws.com";

describe("urlS3", () => {
  const ambienteOriginal = process.env.AWS_S3;

  beforeEach(() => {
    process.env.AWS_S3 = BASE;
  });

  afterAll(() => {
    process.env.AWS_S3 = ambienteOriginal;
  });

  it("monta a URL a partir da chave relativa", () => {
    expect(urlS3("community/authomix/logo.png")).toBe(`${BASE}/community/authomix/logo.png`);
  });

  it("não duplica a barra entre base e chave", () => {
    process.env.AWS_S3 = `${BASE}/`;
    expect(urlS3("/community/authomix/logo.png")).toBe(`${BASE}/community/authomix/logo.png`);
  });

  // Parte do cadastro antigo guarda URL completa na mesma coluna.
  it("devolve a chave intacta quando já é URL absoluta", () => {
    expect(urlS3("https://cdn.exemplo/logo.png")).toBe("https://cdn.exemplo/logo.png");
  });

  it("devolve null para chave vazia, só espaços ou ausente", () => {
    expect(urlS3(null)).toBeNull();
    expect(urlS3(undefined)).toBeNull();
    expect(urlS3("")).toBeNull();
    expect(urlS3("   ")).toBeNull();
  });

  // Sem base configurada não existe URL válida — melhor o fallback do cliente
  // que um link quebrado.
  it("devolve null quando AWS_S3 não está no ambiente", () => {
    delete process.env.AWS_S3;
    expect(urlS3("community/authomix/logo.png")).toBeNull();
  });
});
