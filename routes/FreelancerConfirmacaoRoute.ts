import { Request, Response, Router } from "express";
import { createDocumentedRoute } from "../utils/routeDocumentation";
import { portalAuthMiddleware } from "../middlewares/portalAuthMiddleware";
import { freelancerRoleMiddleware, FreelancerRequest } from "../middlewares/freelancerRoleMiddleware";
import FreelancerConfirmacaoService, { FreelancerConfirmacaoErro } from "../service/freelancerConfirmacaoService";
import { ConfirmarOficinaBody, IdParams, ListarOficinasQuery } from "../schemas/freelancerConfirmacao";

const router = Router();

/**
 * JWT do portal e role FREELANCER para todas as rotas. No nível do router
 * porque `createDocumentedRoute` roda a validação zod antes dos middlewares da
 * rota (L-016): uma chamada sem token com id inválido receberia 400 em vez de
 * 401.
 */
router.use(portalAuthMiddleware, freelancerRoleMiddleware);

const BASE = "/freelancer/confirmacao-dados";
const SEGURANCA = [{ bearerAuth: [] }];
const RESPOSTAS_AUTH = {
  401: { description: "Sem token" },
  403: { description: "Token inválido ou usuário sem a role FREELANCER" },
};

/** Executa o service e traduz o erro de domínio para HTTP, sem vazar stack. */
const responder =
  (executar: (req: Request) => Promise<unknown>) => async (req: Request, res: Response) => {
    try {
      return res.status(200).json(await executar(req));
    } catch (erro) {
      if (erro instanceof FreelancerConfirmacaoErro) {
        return res.status(erro.status).json({ message: erro.message });
      }
      console.error("[freelancerConfirmacao] erro inesperado", { rota: req.method + " " + req.route?.path });
      return res.status(500).json({ message: "Erro interno." });
    }
  };

createDocumentedRoute(router, {
  method: "get",
  path: "/oficinas",
  basePath: BASE,
  schemas: { query: ListarOficinasQuery },
  handler: responder((req) => FreelancerConfirmacaoService.listarOficinas((req as any).validatedQuery)),
  documentation: {
    tags: ["Freelancer"],
    summary: "Oficinas com confirmação de dados pendente",
    description:
      "Query: page (>=1), limit (1..50), search (nome sem acento ou CNPJ). Resposta: { data: [{ID_OFICINA, NOME_FANTASIA, CNPJ, CIDADE, ESTADO}], total }.",
    security: SEGURANCA,
    responses: { 200: { description: "Página de oficinas" }, 400: { description: "Parâmetros inválidos" }, ...RESPOSTAS_AUTH },
  },
});

createDocumentedRoute(router, {
  method: "get",
  path: "/oficinas/:id",
  basePath: BASE,
  schemas: { params: IdParams },
  handler: responder((req) => FreelancerConfirmacaoService.detalharOficina(Number(req.params.id))),
  documentation: {
    tags: ["Freelancer"],
    summary: "Dados da oficina e usuários vinculados",
    security: SEGURANCA,
    responses: { 200: { description: "{ oficina, usuarios }" }, ...RESPOSTAS_AUTH, 404: { description: "Oficina inexistente ou não pendente" } },
  },
});

createDocumentedRoute(router, {
  method: "get",
  path: "/usuarios/:id",
  basePath: BASE,
  schemas: { params: IdParams },
  handler: responder((req) => FreelancerConfirmacaoService.obterUsuario(Number(req.params.id))),
  documentation: {
    tags: ["Freelancer"],
    summary: "Dados do usuário de uma oficina pendente",
    security: SEGURANCA,
    responses: { 200: { description: "{ usuario }" }, ...RESPOSTAS_AUTH, 404: { description: "Usuário inexistente ou de oficina não pendente" } },
  },
});

createDocumentedRoute(router, {
  method: "post",
  path: "/oficinas/:id/confirmar",
  basePath: BASE,
  schemas: { params: IdParams, body: ConfirmarOficinaBody },
  handler: responder((req) =>
    FreelancerConfirmacaoService.confirmar(
      Number(req.params.id),
      req.body,
      (req as FreelancerRequest).freelancerId as number
    )
  ),
  documentation: {
    tags: ["Freelancer"],
    summary: "Confirmar os dados da oficina e suas rotas pendentes",
    description:
      "Atualiza OFICINA, linhas de atividade e (opcional) o usuário, e confirma toda rota pendente com ORIGEM_ACEITE = FREELANCER, numa transação.",
    security: SEGURANCA,
    responses: {
      200: { description: "Confirmada" },
      400: { description: "Payload inválido" },
      ...RESPOSTAS_AUTH,
      404: { description: "Oficina não encontrada" },
      409: { description: "Já confirmada, CNPJ de outra oficina ou e-mail em uso" },
      422: { description: "Usuário não pertence à oficina" },
    },
  },
});

export default router;
