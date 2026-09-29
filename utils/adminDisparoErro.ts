/**
 * Erro de domínio da tela de admin. A rota traduz `status` direto para o HTTP
 * (design, "Error Handling Strategy"); `extra` vai junto no corpo.
 *
 * Mora em `utils/` para os validadores puros (`filtroBuscaOficina`) lançarem o
 * mesmo erro sem importar o service. `service/adminDisparoService` reexporta.
 */
export class AdminDisparoErro extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 422 | 500 | 502,
    message: string,
    public readonly extra?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AdminDisparoErro";
  }
}
