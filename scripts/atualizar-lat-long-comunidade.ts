// Preenche latitude/longitude em "MAIN_REGISTER"."OFICINA" e "dw"."cadastro_empresa"
// para as oficinas dos usuários de uma comunidade, geocodificando a partir do CEP
// cadastrado (GeolocationService: ViaCEP + Nominatim, com fallback para Google Maps).
//
//   npx ts-node scripts/atualizar-lat-long-comunidade.ts <ID_COMMUNITY> [--teste[=N]]
//
// --teste (ou --teste=N) liga o modo de teste: processa (geocodifica e
// atualiza) no máximo N oficinas elegíveis (padrão N=20) mesmo que a
// comunidade tenha centenas. As contagens de diagnóstico (usuários sem
// oficina, oficinas fora do dw, oficinas sem endereço) continuam cobrindo a
// comunidade inteira, já que são só leitura. Use para validar a lógica antes
// do disparo geral.
//
// Uma oficina só é atualizada se NÃO cair em nenhuma das situações problemáticas
// abaixo (elas são reportadas, não corrigidas por este script):
//   1) usuário sem "ID_OFICINA";
//   2) oficina sem nenhuma linha em "dw"."cadastro_empresa";
//   3) oficina sem CEP em "MAIN_REGISTER"."OFICINA" e em nenhuma linha de
//      "dw"."cadastro_empresa" associada a ela.
//
// A geocodificação roda sequencialmente (nunca em paralelo) para respeitar o
// limite de 1 req/s do Nominatim já implementado em GeolocationService, e usa
// um cache por CEP para não repetir chamadas quando a OFICINA e suas linhas de
// cadastro_empresa compartilham o mesmo CEP.
import "dotenv/config";
import { AppDataSourceSync } from "../data-source";
import GeolocationService from "../service/geolocationService";

const geolocationService = new GeolocationService();

interface UsuarioComunidade {
  id_usuario: number;
  id_oficina: number | null;
}

interface OficinaRow {
  ID_OFICINA: number;
  CEP: string | null;
  LATITUDE: string | null;
  LONGITUDE: string | null;
}

interface CadastroEmpresaRow {
  id_oficina: number;
  cnpj_int: string;
  cep: string | null;
  latitude: string | null;
  longitude: string | null;
}

interface Report {
  totalUsuarios: number;
  oficinasAtualizadas: number;
  usuariosSemOficina: number;
  usuariosComOficinaSemCadastroEmpresa: number;
  oficinasSemEndereco: number;
  oficinasJaAtualizadas: number;
  oficinasComFalhaNaGeocodificacao: number;
  modoTeste: boolean;
  oficinasIgnoradasPorLimiteDeTeste: number;
}

type Coordenadas = { lat: number; long: number };

const LIMITE_TESTE_PADRAO = 20;

function cepValido(cep: string | null | undefined): boolean {
  return !!cep && cep.replace(/\D/g, "").length === 8;
}

function parseLimiteTeste(args: string[]): number | null {
  const flag = args.find((a) => a.startsWith("--teste"));
  if (!flag) return null;

  const [, valor] = flag.split("=");
  const limite = valor ? Number(valor) : LIMITE_TESTE_PADRAO;

  if (!Number.isInteger(limite) || limite <= 0) {
    throw new Error(`limite de teste inválido em "${flag}" (esperado um inteiro positivo)`);
  }

  return limite;
}

async function buscarUsuariosDaComunidade(idCommunity: number): Promise<UsuarioComunidade[]> {
  return AppDataSourceSync.query(
    `SELECT us."ID_USUARIO" AS id_usuario, us."ID_OFICINA" AS id_oficina
       FROM "MAIN_REGISTER"."USUARIO_COMMUNITY" uc
       INNER JOIN "MAIN_REGISTER"."USUARIO" us ON us."ID_USUARIO" = uc."id_usuario"
      WHERE uc."id_community" = $1`,
    [idCommunity]
  );
}

async function buscarOficinas(idsOficina: number[]): Promise<Map<number, OficinaRow>> {
  if (idsOficina.length === 0) return new Map();

  const rows: OficinaRow[] = await AppDataSourceSync.query(
    `SELECT "ID_OFICINA", "CEP", "LATITUDE", "LONGITUDE"
       FROM "MAIN_REGISTER"."OFICINA"
      WHERE "ID_OFICINA" = ANY($1::int[])`,
    [idsOficina]
  );

  return new Map(rows.map((row) => [row.ID_OFICINA, row]));
}

async function buscarCadastrosEmpresa(idsOficina: number[]): Promise<Map<number, CadastroEmpresaRow[]>> {
  if (idsOficina.length === 0) return new Map();

  const rows: CadastroEmpresaRow[] = await AppDataSourceSync.query(
    `SELECT id_oficina, cnpj_int, cep, latitude, longitude
       FROM "dw"."cadastro_empresa"
      WHERE id_oficina = ANY($1::int[])`,
    [idsOficina]
  );

  const porOficina = new Map<number, CadastroEmpresaRow[]>();
  for (const row of rows) {
    const lista = porOficina.get(row.id_oficina) ?? [];
    lista.push(row);
    porOficina.set(row.id_oficina, lista);
  }
  return porOficina;
}

async function geocodificarComCache(
  cep: string,
  cache: Map<string, Coordenadas | null>
): Promise<Coordenadas | null> {
  const chave = cep.replace(/\D/g, "");

  if (cache.has(chave)) {
    return cache.get(chave) ?? null;
  }

  const resultado = await geolocationService.getLatLongByCep(cep);
  cache.set(chave, resultado);
  return resultado;
}

async function processarOficina(
  idOficina: number,
  ofi: OficinaRow | undefined,
  cadastros: CadastroEmpresaRow[],
  cache: Map<string, Coordenadas | null>,
  report: Report
): Promise<void> {
  const enderecoOficina = cepValido(ofi?.CEP);
  const enderecoCadastro = cadastros.some((c) => cepValido(c.cep));

  if (!enderecoOficina && !enderecoCadastro) {
    report.oficinasSemEndereco++;
    return;
  }

  let algumaAtualizacao = false;
  let falhaGeocodificacao = false;

  if (ofi && !ofi.LATITUDE && !ofi.LONGITUDE && cepValido(ofi.CEP)) {
    const coords = await geocodificarComCache(ofi.CEP as string, cache);

    console.log(`Oficina ${idOficina}: CEP ${ofi.CEP} geocodificado para`, coords);

    if (coords) {
      await AppDataSourceSync.query(
        `UPDATE "MAIN_REGISTER"."OFICINA"
            SET "LATITUDE" = $1, "LONGITUDE" = $2
          WHERE "ID_OFICINA" = $3
            AND "LATITUDE" IS NULL AND "LONGITUDE" IS NULL`,
        [String(coords.lat), String(coords.long), idOficina]
      );
      algumaAtualizacao = true;
    } else {
      falhaGeocodificacao = true;
    }
  }

  for (const cadastro of cadastros) {
    if (cadastro.latitude || cadastro.longitude || !cepValido(cadastro.cep)) continue;

    const coords = await geocodificarComCache(cadastro.cep as string, cache);
    if (!coords) {
      falhaGeocodificacao = true;
      continue;
    }

    console.log(`Oficina ${idOficina} (CNPJ ${cadastro.cnpj_int}): CEP ${cadastro.cep} geocodificado para`, coords);

    // filtra por cnpj_int (não só id_oficina): pode haver mais de um CNPJ
    // sob o mesmo id_oficina em dw.cadastro_empresa, e escrever só por
    // id_oficina atingiria o cadastro de outra empresa.
    await AppDataSourceSync.query(
      `UPDATE "dw"."cadastro_empresa"
          SET latitude = $1, longitude = $2
        WHERE id_oficina = $3 AND cnpj_int = $4
          AND latitude IS NULL AND longitude IS NULL`,
      [String(coords.lat), String(coords.long), idOficina, cadastro.cnpj_int]
    );
    algumaAtualizacao = true;

    console.log(`Oficina ${idOficina} (CNPJ ${cadastro.cnpj_int}): lat/long atualizados para`, coords);
  }

  if (algumaAtualizacao) {
    report.oficinasAtualizadas++;
  } else if (!falhaGeocodificacao) {
    report.oficinasJaAtualizadas++;
  }

  if (falhaGeocodificacao) {
    report.oficinasComFalhaNaGeocodificacao++;
  }
}

async function main(): Promise<void> {
  const idCommunity = Number(process.argv[2]);
  if (!Number.isInteger(idCommunity) || idCommunity <= 0) {
    throw new Error(
      "informe o id_community: npx ts-node scripts/atualizar-lat-long-comunidade.ts 123"
    );
  }

  const limiteTeste = parseLimiteTeste(process.argv.slice(3));

  if (limiteTeste !== null) {
    console.log(`>>> MODO DE TESTE ATIVO: no máximo ${limiteTeste} oficina(s) serão geocodificadas/atualizadas.`);
  }

  await AppDataSourceSync.initialize();

  const report: Report = {
    totalUsuarios: 0,
    oficinasAtualizadas: 0,
    usuariosSemOficina: 0,
    usuariosComOficinaSemCadastroEmpresa: 0,
    oficinasSemEndereco: 0,
    oficinasJaAtualizadas: 0,
    oficinasComFalhaNaGeocodificacao: 0,
    modoTeste: limiteTeste !== null,
    oficinasIgnoradasPorLimiteDeTeste: 0,
  };

  try {
    const usuarios = await buscarUsuariosDaComunidade(idCommunity);
    report.totalUsuarios = usuarios.length;
    report.usuariosSemOficina = usuarios.filter((u) => u.id_oficina === null).length;

    console.log(`Processando ${report.totalUsuarios} usuários da comunidade ${idCommunity}...`);

    const idsOficina = [
      ...new Set(usuarios.map((u) => u.id_oficina).filter((id): id is number => id !== null)),
    ];

    console.log(`Encontradas ${idsOficina.length} oficinas distintas para geocodificação...`);

    const [oficinas, cadastrosEmpresa] = await Promise.all([
      buscarOficinas(idsOficina),
      buscarCadastrosEmpresa(idsOficina),
    ]);

    report.usuariosComOficinaSemCadastroEmpresa = usuarios.filter(
      (u) => u.id_oficina !== null && (cadastrosEmpresa.get(u.id_oficina)?.length ?? 0) === 0
    ).length;

    const idsElegiveis = idsOficina.filter((id) => (cadastrosEmpresa.get(id)?.length ?? 0) > 0);

    let idsParaProcessar = idsElegiveis;
    if (limiteTeste !== null && idsElegiveis.length > limiteTeste) {
      idsParaProcessar = idsElegiveis.slice(0, limiteTeste);
      report.oficinasIgnoradasPorLimiteDeTeste = idsElegiveis.length - limiteTeste;
      console.log(
        `Modo de teste: ${idsElegiveis.length} oficina(s) elegível(is), processando apenas ${idsParaProcessar.length}.`
      );
    }

    const cache = new Map<string, Coordenadas | null>();

    for (const idOficina of idsParaProcessar) {
      await processarOficina(
        idOficina,
        oficinas.get(idOficina),
        cadastrosEmpresa.get(idOficina) ?? [],
        cache,
        report
      );
    }
  } finally {
    await AppDataSourceSync.destroy();
  }

  console.log("\n=== Relatório de atualização de lat/long — comunidade", idCommunity, "===");
  if (report.modoTeste) {
    console.log(`>>> MODO DE TESTE (limite de ${limiteTeste} oficina(s) processada(s))`);
  }
  console.log(`Total de usuários na comunidade                     : ${report.totalUsuarios}`);
  console.log(`Oficinas atualizadas (lat/long preenchidos)         : ${report.oficinasAtualizadas}`);
  console.log(`Usuários sem oficina (ID_OFICINA nulo)              : ${report.usuariosSemOficina}`);
  console.log(`Usuários com oficina fora de dw.cadastro_empresa    : ${report.usuariosComOficinaSemCadastroEmpresa}`);
  console.log(`Oficinas sem endereço (CEP nulo nas duas fontes)    : ${report.oficinasSemEndereco}`);
  console.log("--- informações adicionais ---");
  console.log(`Oficinas já com lat/long preenchidos (nada a fazer) : ${report.oficinasJaAtualizadas}`);
  console.log(`Oficinas com falha na geocodificação do CEP         : ${report.oficinasComFalhaNaGeocodificacao}`);
  if (report.modoTeste) {
    console.log(`Oficinas elegíveis ignoradas pelo limite de teste   : ${report.oficinasIgnoradasPorLimiteDeTeste}`);
  }
}

main().catch((erro: Error) => {
  console.error(erro.message);
  process.exit(1);
});
