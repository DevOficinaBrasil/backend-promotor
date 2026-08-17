import { EntityManager, MoreThan } from "typeorm";
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import { AppDataSourceSync } from "../data-source";
import NotificacaoVisita, { StatusNotificacaoVisita } from "../entities/NotificacaoVisita";
import Oficina from "../entities/Oficina";
import Empresa from "../entities/CadastroEmpresa";
import { cnpjParaInteiro, dividirLogradouro } from "../utils/logradouro";
import RotaPromotor from "../entities/RotaPromotor";
import Community from "../entities/Community";
import Usuario from "../entities/Usuario";
import RotaService from "./rotaService";
import { statusEfetivo } from "../utils/statusNotificacaoVisita";
import { urlS3 } from "../utils/urlS3";
import { emitirJwt, hashToken, VisitaJwtPayload } from "../utils/visitaToken";

/** The seven address columns a link-holder may see and correct. Nothing else. */
export const CAMPOS_ENDERECO = [
  "ENDERECO",
  "NUMERO",
  "COMPLEMENTO",
  "BAIRRO",
  "CIDADE",
  "ESTADO",
  "CEP",
] as const;

export type CampoEndereco = (typeof CAMPOS_ENDERECO)[number];

export type EnderecoOficina = Record<CampoEndereco, string | null>;

export type ExchangeResult =
  | {
      state: "PENDING";
      jwt: string;
      oficinaNome: string | null;
      usuarioNome: string | null;
      promotorNome: string | null;
      empresaNome: string | null;
      empresaLogoUrl: string | null;
      endereco: EnderecoOficina;
    }
  | {
      state: "ALREADY_CONFIRMED";
      oficinaNome: string | null;
      promotorNome: string | null;
      empresaNome: string | null;
      empresaLogoUrl: string | null;
      endereco: EnderecoOficina;
      confirmadoEm: Date | null;
    }
  // A tela de expirado atribui o próximo contato à empresa do convite, então o
  // estado morto também carrega quem convidou.
  | { state: "EXPIRED"; empresaNome: string | null; empresaLogoUrl: string | null }
  | { state: "TOKEN_INVALID" };

export type ConfirmResult =
  | { state: "CONFIRMED"; confirmadoEm: Date; enderecoAtualizado: boolean }
  | { state: "ALREADY_CONFIRMED"; confirmadoEm: Date | null }
  | { state: "EXPIRED" }
  | { state: "TOKEN_INVALID" };

export type EnderecoResult =
  | ConfirmResult
  | { state: "VALIDATION_ERROR"; campos: string[] }
  | { state: "ADDRESS_UPDATE_FAILED" };

/** CEP comparável: só os dígitos, para máscara não virar mudança de endereço. */
function apenasDigitos(valor: string | null): string {
  return valor === null ? "" : valor.replace(/\D/g, "");
}

/**
 * Escolhe qual linha de `dw.cadastro_empresa` representa esta oficina, ou `null`
 * quando não há como saber.
 *
 * A consulta é SQL cru de propósito: a entity declara `id_oficina` como
 * `@PrimaryGeneratedColumn`, o que é mentira nessa tabela, e um `find` faria o
 * TypeORM colapsar as linhas repetidas em uma só pela PK — exatamente a
 * duplicidade que precisa ser vista aqui.
 *
 * Ordem de decisão:
 * 1. linha cujo `cnpj_int` é o CNPJ da oficina — a identificação confiável;
 * 2. linha única sob aquele `id_oficina`, mesmo com CNPJ divergente (os ~100
 *    pares em que os dois cadastros discordam);
 * 3. nada: zero linhas, ou várias sem CNPJ correspondente.
 */
async function escolherLinhaDoDw(
  manager: EntityManager,
  idOficina: number,
  cnpjInt: string | null
): Promise<{ ID_OFICINA: number; CNPJ_INT?: string } | null> {
  const candidatas: { CNPJ_INT: string | null }[] = await manager.query(
    `SELECT cnpj_int::text AS "CNPJ_INT" FROM dw.cadastro_empresa WHERE id_oficina = $1`,
    [idOficina]
  );

  if (candidatas.length === 0) {
    return null;
  }

  if (cnpjInt !== null && candidatas.some((linha) => linha.CNPJ_INT === cnpjInt)) {
    return { ID_OFICINA: idOficina, CNPJ_INT: cnpjInt };
  }

  if (candidatas.length === 1) {
    return { ID_OFICINA: idOficina };
  }

  return null;
}

/** Projects an Oficina row onto the address allowlist, normalising undefined to null. */
function extrairEndereco(oficina: Oficina | null): EnderecoOficina {
  return {
    ENDERECO: oficina?.ENDERECO ?? null,
    NUMERO: oficina?.NUMERO ?? null,
    COMPLEMENTO: oficina?.COMPLEMENTO ?? null,
    BAIRRO: oficina?.BAIRRO ?? null,
    CIDADE: oficina?.CIDADE ?? null,
    ESTADO: oficina?.ESTADO ?? null,
    CEP: oficina?.CEP ?? null,
  };
}

export default class VisitaConfirmacaoService {
  /**
   * Exchanges the WhatsApp link's opaque token for a short-lived, visit-scoped
   * JWT (spec AC14-AC18, AC30).
   *
   * Read-only by design: expiry is decided by statusEfetivo() and the stored
   * STATUS column is never mutated here, so an unopened expired link still
   * reports EXPIRADO on every read path. Re-exchangeable while the visit is
   * live (spec AC15) — only the CONFIRMADO transition is single-use.
   *
   * @param agora - injectable clock so the expiry boundary is testable
   */
  static async trocarToken(rawToken: string, agora: Date = new Date()): Promise<ExchangeResult> {
    // AC16: a malformed token never reaches the database.
    if (typeof rawToken !== "string" || rawToken.trim() === "") {
      return { state: "TOKEN_INVALID" };
    }

    const repo = AppDataSourceSync.getRepository(NotificacaoVisita);
    const notificacao = await repo.findOne({ where: { TOKEN_HASH: hashToken(rawToken) } });

    if (notificacao === null) {
      return { state: "TOKEN_INVALID" };
    }

    const status = statusEfetivo(notificacao, agora);

    if (status === StatusNotificacaoVisita.EXPIRADO) {
      // AC17. Só a empresa é resolvida: a tela de expirado não mostra oficina,
      // promotor nem endereço, e o convite morto não deve pagar por eles.
      const empresa = await this.carregarEmpresa(notificacao);

      return { state: "EXPIRED", ...empresa };
    }

    if (status === StatusNotificacaoVisita.CONFIRMADO) {
      // AC18. Carries the promoter's name and the address alongside the
      // confirmation date: the confirmed screen restates who is coming and
      // which address was confirmed, so the reparador can tell at a glance
      // whether the visit they are looking at is the one they expect. No JWT —
      // there is no further action to authorize.
      //
      // A empresa também vem aqui: a tela de "já confirmado" repete o mesmo
      // resumo da tela de sucesso, que nomeia quem faz a visita.
      const confirmado = await this.carregarContexto(notificacao);

      return {
        state: "ALREADY_CONFIRMED",
        oficinaNome: confirmado.oficina?.NOME_FANTASIA ?? null,
        promotorNome: confirmado.promotorNome,
        empresaNome: confirmado.empresaNome,
        empresaLogoUrl: confirmado.empresaLogoUrl,
        endereco: extrairEndereco(confirmado.oficina),
        confirmadoEm: notificacao.CONFIRMADO_EM ?? null,
      };
    }

    // Only a live, dispatched notification is exchangeable. PENDENTE, FALHOU
    // and DISPENSADO rows never had a delivered link to open.
    if (status !== StatusNotificacaoVisita.ENVIADO || notificacao.ID_USUARIO == null) {
      return { state: "TOKEN_INVALID" };
    }

    const { oficina, promotorNome, empresaNome, empresaLogoUrl } =
      await this.carregarContexto(notificacao);

    // AC14: JWT plus the workshop's name, who is visiting (promoter and the
    // client company the campaign runs for) and the current registered address.
    // AC30: no visit date is returned — the schema has no per-visit date.
    //
    // `usuarioNome` é o dono do link (a saudação da tela inicial), e sai só
    // nesta resposta — as outras telas não cumprimentam ninguém.
    return {
      state: "PENDING",
      jwt: emitirJwt({
        sub: notificacao.ID_USUARIO,
        ID_NOTIFICACAO_VISITA: notificacao.ID_NOTIFICACAO_VISITA!,
        ID_ROTA_PROMOTOR: notificacao.ID_ROTA_PROMOTOR!,
      }),
      oficinaNome: oficina?.NOME_FANTASIA ?? null,
      usuarioNome: await this.carregarUsuarioNome(notificacao.ID_USUARIO),
      promotorNome,
      empresaNome,
      empresaLogoUrl,
      endereco: extrairEndereco(oficina),
    };
  }

  /**
   * Applies the ENVIADO→CONFIRMADO transition with its audit fields
   * (spec AC19-AC21).
   *
   * Live state decides, not the JWT's snapshot at issuance: the conditional
   * UPDATE re-checks STATUS and expiry in the same statement, so a JWT minted
   * before EXPIRA_EM passed can no longer confirm a dead visit.
   *
   * @param agora - injectable clock so the expiry boundary is testable
   */
  static async confirmar(
    payload: VisitaJwtPayload,
    ip: string,
    agora: Date = new Date()
  ): Promise<ConfirmResult> {
    return await this.transicionar(payload, ip, false, agora);
  }

  /**
   * Corrects the workshop's address and confirms the visit in one call
   * (spec AC31-AC33).
   *
   * Three guarantees, in this order:
   * 1. Only the seven allowlisted address columns are writable. Any other key
   *    is rejected outright and nothing is written (AC32).
   * 2. The address write happens before the CONFIRMADO transition and must
   *    succeed. A rejected write — including a missing UPDATE grant on
   *    MAIN_REGISTER — leaves the notification STATUS untouched and surfaces a
   *    distinct error, never a false confirmation (AC33).
   * 3. LATITUDE/LONGITUDE are deliberately left alone. Note this is a scope
   *    decision, not a technical limit: reatribuirRotas() below geocodes the new
   *    CEP through geolocationService to pick the nearest promoter, then throws
   *    the coordinates away. A corrected address keeps its old pin.
   *
   * The correction lands on both address sources in a single transaction
   * (VISIB-07, VISIB-13): MAIN_REGISTER.OFICINA, read by GET /campanha/:id, and
   * dw.cadastro_empresa, read by the two raw-SQL campaign queries. Writing only
   * the first is what made a corrected address invisible to the promoter. A
   * failure on either side rolls both back and the visit stays unconfirmed.
   *
   * @param agora - injectable clock so the expiry boundary is testable
   */
  static async atualizarEndereco(
    payload: VisitaJwtPayload,
    endereco: Record<string, unknown>,
    ip: string,
    agora: Date = new Date()
  ): Promise<EnderecoResult> {
    const permitidos = new Set<string>(CAMPOS_ENDERECO);
    const invalidos = Object.keys(endereco ?? {}).filter((campo) => !permitidos.has(campo));

    // AC32
    if (invalidos.length > 0) {
      return { state: "VALIDATION_ERROR", campos: invalidos };
    }

    const repo = AppDataSourceSync.getRepository(NotificacaoVisita);
    const notificacao = await repo.findOne({
      where: { ID_NOTIFICACAO_VISITA: payload.ID_NOTIFICACAO_VISITA },
    });

    if (notificacao === null) {
      return { state: "TOKEN_INVALID" };
    }

    // A visit that can no longer be confirmed must not cause a registry write.
    const status = statusEfetivo(notificacao, agora);

    if (status === StatusNotificacaoVisita.CONFIRMADO) {
      return { state: "ALREADY_CONFIRMED", confirmadoEm: notificacao.CONFIRMADO_EM ?? null };
    }

    if (status === StatusNotificacaoVisita.EXPIRADO) {
      return { state: "EXPIRED" };
    }

    if (status !== StatusNotificacaoVisita.ENVIADO) {
      return { state: "TOKEN_INVALID" };
    }

    const oficina = await this.carregarOficina(notificacao);

    if (oficina?.ID_OFICINA == null) {
      return { state: "TOKEN_INVALID" };
    }

    // dw.cadastro_empresa splits the single-line address in two columns:
    // `logradouro` is the type and `rua` is the name. Entity property names,
    // not column names — TypeORM ignores unknown keys without complaining.
    const { logradouro, rua } = dividirLogradouro((endereco.ENDERECO as string | null) ?? null);

    // `logradouro` só entra no update quando o split reconheceu o tipo. Sem essa
    // guarda, todo endereço cuja primeira palavra está fora de TIPOS_LOGRADOURO
    // — "Av.", "R.", "Rod.", "Via", "Largo", ou um OFICINA.ENDERECO já gravado
    // sem o tipo — zeraria a coluna, e as queries de campanha, que montam o
    // endereço com CONCAT(logradouro, ' ', rua), passariam a exibir a rua sem o
    // tipo. Chave ausente é coluna intocada no TypeORM.
    const valoresEmpresa = {
      ...(logradouro !== null ? { LOGRADOURO: logradouro } : {}),
      ENDERECO: rua,
      NUMERO: endereco.NUMERO,
      COMPLEMENTO: endereco.COMPLEMENTO,
      BAIRRO: endereco.BAIRRO,
      CIDADE: endereco.CIDADE,
      ESTADO: endereco.ESTADO,
      CEP: endereco.CEP,
    } as QueryDeepPartialEntity<Empresa>;

    const cnpjInt = cnpjParaInteiro(oficina.CNPJ ?? null);

    try {
      await AppDataSourceSync.transaction(async (manager) => {
        await manager.update(Oficina, { ID_OFICINA: oficina.ID_OFICINA }, endereco);

        // `id_oficina` não identifica uma linha em dw.cadastro_empresa: a chave
        // única é `cnpj_int`, e em PRD 59 ids se repetem sob CNPJs diferentes.
        // Por isso a linha é escolhida antes de escrever, e não descoberta pelo
        // `affected` de um update às cegas.
        const alvo = await escolherLinhaDoDw(manager, oficina.ID_OFICINA!, cnpjInt);

        // Nenhuma linha, ou várias sem CNPJ correspondente: não há como saber
        // qual cadastro é desta oficina. Antes, o caminho ambíguo escrevia em
        // todas e depois derrubava a transação — a oficina ficava sem confirmar
        // por causa de dado sujo do dw, que não é problema dela nem do
        // reparador. O endereço em MAIN_REGISTER.OFICINA, que é o que o app do
        // promotor lê, já foi corrigido; o dw fica para trás com log.
        if (alvo === null) {
          console.warn("[visitaConfirmacao] dw.cadastro_empresa não atualizado", {
            ID_NOTIFICACAO_VISITA: payload.ID_NOTIFICACAO_VISITA,
            ID_OFICINA: oficina.ID_OFICINA,
            motivo: "linha não identificável por id_oficina + cnpj",
          });
          return;
        }

        // Falha de banco aqui (permissão, constraint, deadlock) continua
        // propagando: essa sim reverte as duas escritas (VISIB-13).
        await manager.update(Empresa, alvo, valoresEmpresa);
      });
    } catch (erro) {
      console.error("[visitaConfirmacao] falha ao atualizar endereço da oficina", {
        ID_NOTIFICACAO_VISITA: payload.ID_NOTIFICACAO_VISITA,
        ID_ROTA_PROMOTOR: payload.ID_ROTA_PROMOTOR,
        erro: (erro as Error)?.message,
      });
      return { state: "ADDRESS_UPDATE_FAILED" };
    }

    const resultado = await this.transicionar(payload, ip, true, agora);

    // Only a CEP change moves the workshop on the map: reassignRotasByAddress
    // geocodes by CEP alone, so correcting a street number or complement would
    // recompute identical coordinates. Runs after the CONFIRMADO transition so
    // the route created by a reassignment sees the confirmation and its
    // notification is dispensed by the anti-spam guard (AC29) instead of
    // messaging the reparador again seconds after they confirmed.
    if (resultado.state === "CONFIRMED") {
      const cepNovo = typeof endereco.CEP === "string" ? endereco.CEP : null;

      // Comparação por dígitos: o form do jornal manda o CEP como o reparador
      // digitou, com ou sem máscara, e o cadastro guarda os dois formatos. Sem
      // isso, "13010-000" contra "13010000" contava como mudança de endereço e
      // disparava reatribuição de rota — que pode trocar o promotor da visita —
      // sem a oficina ter saído do lugar.
      if (cepNovo !== null && apenasDigitos(cepNovo) !== apenasDigitos(oficina.CEP ?? null)) {
        await this.reatribuirRotas(oficina.ID_OFICINA, cepNovo, payload);
      }
    }

    return resultado;
  }

  /**
   * Re-runs promoter assignment after the reparador moves the workshop.
   *
   * Isolated on purpose: the confirmation is already committed and must stand
   * on its own. A workshop with no BACKLOG route throws NOT_FOUND and an
   * unresolvable CEP throws too — neither is a failure of the confirmation, so
   * both are logged and swallowed.
   */
  private static async reatribuirRotas(
    idOficina: number,
    cep: string,
    payload: VisitaJwtPayload
  ): Promise<void> {
    try {
      const resultado = await RotaService.reassignRotasByAddress(cep, idOficina);
      console.log("[visitaConfirmacao] rotas reavaliadas após correção de endereço", {
        ID_NOTIFICACAO_VISITA: payload.ID_NOTIFICACAO_VISITA,
        ID_OFICINA: idOficina,
        ...resultado.resumo,
      });
    } catch (erro) {
      console.error("[visitaConfirmacao] falha ao reatribuir rotas após correção", {
        ID_NOTIFICACAO_VISITA: payload.ID_NOTIFICACAO_VISITA,
        ID_OFICINA: idOficina,
        erro: (erro as Error)?.message,
      });
    }
  }

  protected static async transicionar(
    payload: VisitaJwtPayload,
    ip: string,
    enderecoAtualizado: boolean,
    agora: Date
  ): Promise<ConfirmResult> {
    const repo = AppDataSourceSync.getRepository(NotificacaoVisita);
    const id = payload.ID_NOTIFICACAO_VISITA;

    // One guarded statement, so two concurrent confirms produce exactly one
    // transition (AC21) — the loser simply affects 0 rows. The EXPIRA_EM guard
    // is required, not decorative: expiry is derived rather than stored, so an
    // expired row still reads STATUS='ENVIADO' in the database.
    const resultado = await repo.update(
      {
        ID_NOTIFICACAO_VISITA: id,
        STATUS: StatusNotificacaoVisita.ENVIADO,
        EXPIRA_EM: MoreThan(agora),
      },
      {
        STATUS: StatusNotificacaoVisita.CONFIRMADO,
        CONFIRMADO_EM: agora,
        CONFIRMADO_POR: payload.sub,
        CONFIRMADO_IP: ip,
        ...(enderecoAtualizado ? { ENDERECO_ATUALIZADO: true } : {}),
      }
    );

    if ((resultado.affected ?? 0) > 0) {
      return { state: "CONFIRMED", confirmadoEm: agora, enderecoAtualizado };
    }

    // Zero rows means somebody or something got there first. Re-read rather
    // than guess, so a lost race is never reported as a success.
    const linha = await repo.findOne({ where: { ID_NOTIFICACAO_VISITA: id } });

    if (linha === null) {
      return { state: "TOKEN_INVALID" };
    }

    const status = statusEfetivo(linha, agora);

    if (status === StatusNotificacaoVisita.CONFIRMADO) {
      return { state: "ALREADY_CONFIRMED", confirmadoEm: linha.CONFIRMADO_EM ?? null };
    }

    if (status === StatusNotificacaoVisita.EXPIRADO) {
      return { state: "EXPIRED" };
    }

    return { state: "TOKEN_INVALID" };
  }

  /**
   * Everything the confirmation page reads off the route in one pass: the
   * workshop, the promoter assigned to the visit, and the company the campaign
   * runs for — resolved through CAMPANHA.EMPRESA_SLUG, since CAMPANHA.ID_CLIENT
   * is a SQL Server id with no table reachable from here.
   *
   * The route is fetched once, with its relations, and both answers are derived
   * from that single row — resolving them separately meant reading the same
   * RotaPromotor row twice on every exchange.
   *
   * Every field degrades to null rather than throwing. The page is still usable
   * without them, and an unresolvable relation must never cost the reparador
   * their link; the frontend contract already allows every address field to be
   * null, so a gap in the registry degrades to empty inputs instead of a false
   * "link inválido".
   */
  protected static async carregarContexto(notificacao: NotificacaoVisita): Promise<{
    oficina: Oficina | null;
    promotorNome: string | null;
    empresaNome: string | null;
    empresaLogoUrl: string | null;
  }> {
    const rota = await this.carregarRotaComRelacoes(notificacao);

    const promotorNome = rota?.campanhaPromotor?.promotor?.NOME ?? null;
    const oficina = await this.carregarOficinaDaRota(rota);
    const empresa = await this.carregarEmpresaDaRota(rota);

    return { oficina, promotorNome, ...empresa };
  }

  /**
   * Nome e logo da empresa por trás do convite, sem tocar em oficina nem
   * promotor — o que a tela de expirado precisa e nada além.
   */
  protected static async carregarEmpresa(
    notificacao: NotificacaoVisita
  ): Promise<{ empresaNome: string | null; empresaLogoUrl: string | null }> {
    return await this.carregarEmpresaDaRota(await this.carregarRotaComRelacoes(notificacao));
  }

  private static async carregarRotaComRelacoes(
    notificacao: NotificacaoVisita
  ): Promise<RotaPromotor | null> {
    return await AppDataSourceSync.getRepository(RotaPromotor).findOne({
      where: { ID_ROTA_PROMOTOR: notificacao.ID_ROTA_PROMOTOR },
      relations: ["campanhaPromotor", "campanhaPromotor.promotor", "campanhaPromotor.campanha"],
    });
  }

  private static async carregarEmpresaDaRota(
    rota: RotaPromotor | null
  ): Promise<{ empresaNome: string | null; empresaLogoUrl: string | null }> {
    const empresaSlug = rota?.campanhaPromotor?.campanha?.EMPRESA_SLUG;

    if (empresaSlug == null) {
      return { empresaNome: null, empresaLogoUrl: null };
    }

    const community = await AppDataSourceSync.getRepository(Community).findOne({
      where: { EmpresaSlug: empresaSlug },
    });

    // `Icon` guarda chave relativa do bucket; quem consome recebe URL pronta,
    // porque esta página é pública e não compartilha a env de S3 do portal.
    return {
      empresaNome: community?.Nome ?? null,
      empresaLogoUrl: urlS3(community?.Icon ?? null),
    };
  }

  /**
   * Nome do dono do link, para a saudação da tela inicial. Degrada para null —
   * a headline funciona sem nome, e o usuário pode ter sido apagado depois do
   * envio.
   */
  private static async carregarUsuarioNome(idUsuario?: number | null): Promise<string | null> {
    if (idUsuario == null) {
      return null;
    }

    const usuario = await AppDataSourceSync.getRepository(Usuario).findOne({
      where: { ID_USUARIO: idUsuario },
    });

    return usuario?.NOME ?? null;
  }

  /**
   * Resolves the workshop behind a notification through its route.
   *
   * Kept for the address-correction path, which needs the workshop and nothing
   * else — the exchange path goes through carregarContexto instead so it reads
   * the route only once.
   */
  protected static async carregarOficina(
    notificacao: NotificacaoVisita
  ): Promise<Oficina | null> {
    const rota = await AppDataSourceSync.getRepository(RotaPromotor).findOne({
      where: { ID_ROTA_PROMOTOR: notificacao.ID_ROTA_PROMOTOR },
    });

    return await this.carregarOficinaDaRota(rota);
  }

  private static async carregarOficinaDaRota(rota: RotaPromotor | null): Promise<Oficina | null> {
    if (rota === null || rota.ID_OFICINA == null) {
      return null;
    }

    return await AppDataSourceSync.getRepository(Oficina).findOne({
      where: { ID_OFICINA: rota.ID_OFICINA },
    });
  }
}
