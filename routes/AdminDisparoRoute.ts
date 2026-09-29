import { Request, Response, Router } from "express";
import { z } from "zod";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import { adminAuthMiddleware, AdminRequest } from "../middlewares/adminAuthMiddleware";
import AdminDisparoService, { AdminDisparoErro } from "../service/adminDisparoService";

const router = Router();

/**
 * Todas as rotas de /admin passam pelo JWT de admin (CONV-03, CONV-04, AD-004).
 *
 * SPEC_DEVIATION: o design pede `middlewares: [adminAuthMiddleware]` em cada
 * rota. Reason: `createDocumentedRoute` roda a validação zod antes dos
 * middlewares da rota (L-016), e uma chamada sem token com id inválido
 * receberia 400 em vez de 401. No nível do router a autenticação roda antes de
 * qualquer validação, para as 9 rotas.
 */
router.use(adminAuthMiddleware);

const IdCampanhaParams = z.object({ id: z.coerce.number().int().positive() });
const RotasQuery = z.object({ estado: z.string().min(1).optional() });

const BASE = "/admin";
const SEGURANCA = [{ bearerAuth: [] }];
const RESPOSTAS_AUTH = {
  401: { description: "Sem token, token inválido ou expirado" },
  403: { description: "Token válido sem IS_ADMIN" },
};

/**
 * Executa o service e traduz o erro de domínio para o HTTP do design ("Error
 * Handling Strategy"): o `status` do erro vira o status da resposta, com a
 * mensagem e os campos extras (`tetoMinimo`, `details`...) no corpo.
 */
const responder =
  (executar: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      return res.status(200).json(await executar(req));
    } catch (erro) {
      if (erro instanceof AdminDisparoErro) {
        return res.status(erro.status).json({ message: erro.message, ...(erro.extra ?? {}) });
      }
      console.error("[adminDisparo] erro inesperado", { rota: req.originalUrl, erro: (erro as Error)?.message });
      return res.status(500).json({ message: "Erro interno." });
    }
  };

const idCampanha = (req: Request) => Number(req.params.id);
const idAdmin = (req: Request) => (req as AdminRequest).admin?.idUsuario;

createDocumentedRoute(router, {
  method: "get",
  path: "/campanhas/ativas",
  basePath: BASE,
  handler: responder(() => AdminDisparoService.listarCampanhasAtivas()),
  documentation: {
    tags: ["Admin"],
    summary: "Listar campanhas ativas de todos os clientes",
    description: "PUBLICADA, sem DELETED_AT e dentro do período (END_TIME nulo = sem fim), com clienteNome (nulo quando não resolvível).",
    security: SEGURANCA,
    responses: { 200: { description: "CampanhaAdminResumo[]" }, ...RESPOSTAS_AUTH },
  },
});

createDocumentedRoute(router, {
  method: "get",
  path: "/campanhas/:id/promotores",
  basePath: BASE,
  schemas: { params: IdCampanhaParams },
  handler: responder((req) => AdminDisparoService.listarPromotores(idCampanha(req))),
  documentation: {
    tags: ["Admin"],
    summary: "Promotores vinculados à campanha e do cliente",
    description: "{ vinculados: [{ID_CAMPANHA_PROMOTOR, ID_PROMOTOR, NOME, RAIO, LAT, LNG}], doCliente: [{ID_PROMOTOR, NOME, LAT, LNG}] }",
    security: SEGURANCA,
    responses: { 200: { description: "Promotores" }, ...RESPOSTAS_AUTH, 404: { description: "Campanha não encontrada" } },
  },
});

createDocumentedRoute(router, {
  method: "get",
  path: "/campanhas/:id/rotas",
  basePath: BASE,
  schemas: { params: IdCampanhaParams, query: RotasQuery },
  handler: responder((req) =>
    AdminDisparoService.listarRotasComEstado(idCampanha(req), (req as any).validatedQuery?.estado)
  ),
  documentation: {
    tags: ["Admin"],
    summary: "Rotas da campanha com o estado do convite",
    description: "Resposta: { rotas: RotaComEstado[], totaisPorEstado }. `estado` filtra as rotas; os totais são sempre de todas.",
    security: SEGURANCA,
    responses: {
      200: { description: "Rotas e totais" },
      400: { description: "Estado desconhecido" },
      ...RESPOSTAS_AUTH,
      404: { description: "Campanha não encontrada" },
    },
  },
});

createDocumentedRoute(router, {
  method: "post",
  path: "/campanhas/:id/rotas",
  basePath: BASE,
  schemas: { params: IdCampanhaParams },
  handler: responder((req) => AdminDisparoService.criarRotas(idCampanha(req), req.body, idAdmin(req))),
  documentation: {
    tags: ["Admin"],
    summary: "Criar rotas pela tela de admin (sem enfileirar convite)",
    description:
      "Body: { atribuicoes: [{idCampanhaPromotor, idOficina}] } ou { distribuir: true, idOficinas }. " +
      "Resposta: { criadas, conflitos: [{idOficina, status 409|422, motivo, promotorAtual?}], foraDoAlcance }.",
    security: SEGURANCA,
    responses: {
      200: { description: "Resultado por oficina" },
      400: { description: "Entrada inválida ou vínculo de outra campanha" },
      ...RESPOSTAS_AUTH,
      404: { description: "Campanha não encontrada" },
    },
  },
});

createDocumentedRoute(router, {
  method: "post",
  path: "/campanhas/:id/disparos/previa",
  basePath: BASE,
  schemas: { params: IdCampanhaParams },
  handler: responder((req) =>
    AdminDisparoService.previaDisparo(idCampanha(req), req.body?.rotaIds, req.body?.tetoDiario)
  ),
  documentation: {
    tags: ["Admin"],
    summary: "Prévia do disparo (não escreve nada)",
    description: "Body: { rotaIds, tetoDiario }. Resposta: { totalConvites, jaDisparadas, porDia, ultimoDia }.",
    security: SEGURANCA,
    responses: {
      200: { description: "Prévia" },
      400: { description: "Teto fora de 1..1000 ou rotas inválidas" },
      ...RESPOSTAS_AUTH,
      404: { description: "Campanha não encontrada" },
      422: { description: "Passa do fim da campanha; corpo traz tetoMinimo" },
    },
  },
});

createDocumentedRoute(router, {
  method: "post",
  path: "/campanhas/:id/disparos",
  basePath: BASE,
  schemas: { params: IdCampanhaParams },
  handler: responder((req) =>
    AdminDisparoService.disparar(idCampanha(req), req.body?.rotaIds, req.body?.tetoDiario)
  ),
  documentation: {
    tags: ["Admin"],
    summary: "Disparar os convites com teto diário",
    description: "Body: { rotaIds, tetoDiario }. Resposta: { enfileiradas, jaDisparadas, porDia, ultimoDia }.",
    security: SEGURANCA,
    responses: {
      200: { description: "Resumo do disparo" },
      400: { description: "Teto fora de 1..1000 ou rotas inválidas" },
      ...RESPOSTAS_AUTH,
      404: { description: "Campanha não encontrada" },
      422: { description: "Passa do fim da campanha; corpo traz tetoMinimo" },
    },
  },
});

export default router;
