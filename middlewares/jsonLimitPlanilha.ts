import express from "express";

/**
 * Caminho do lote de importação de oficinas. Exportado para que o app e os
 * testes montem o parser exatamente no mesmo lugar.
 */
export const IMPORT_STREAM_PATH = "/oficina/import-stream";

/**
 * Teto de corpo do lote de importação. 5.000 linhas de oficina, com os oito
 * campos preenchidos, ficam na casa de poucos megabytes; 8MB dá folga sem
 * abrir espaço para um corpo arbitrariamente grande.
 */
export const IMPORT_STREAM_BODY_LIMIT = "8mb";

const parser = express.json({ limit: IMPORT_STREAM_BODY_LIMIT });

/**
 * Monta um parser de JSON com teto maior, **somente** para o caminho do lote
 * de importação.
 *
 * Precisa ser montado ANTES do `express.json()` global: o parser global usa o
 * teto padrão de 100kb e um lote de milhares de oficinas estoura isso com
 * folga, o que devolveria 413 antes de a requisição chegar ao controller — um
 * erro sem nenhuma relação óbvia com a causa. O `body-parser` marca a
 * requisição como já lida, então o parser global seguinte não refaz o
 * trabalho nem reaplica o teto menor.
 *
 * O teto global fica como está de propósito: afrouxá-lo aumentaria a
 * superfície de todas as outras rotas para ganhar algo que só esta precisa.
 */
export function montarParserDeLotePlanilha(app: express.Application): void {
  app.use(IMPORT_STREAM_PATH, parser);
}

export default parser;
