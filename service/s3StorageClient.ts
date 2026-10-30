import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { formatInTimeZone } from "date-fns-tz";
import { FUSO_RELATORIO, PeriodoRelatorio } from "../utils/promotorReportCalculos";

export type ResultadoUpload = { sucesso: true; url: string } | { sucesso: false; motivo: string };

function montarChave(idCliente: number, periodo: PeriodoRelatorio): string {
  const inicio = formatInTimeZone(periodo.inicio, FUSO_RELATORIO, "yyyy-MM-dd");
  const fim = formatInTimeZone(periodo.fim, FUSO_RELATORIO, "yyyy-MM-dd");
  // Sufixo aleatório: o objeto é público sem expiração (RELPROM-47), e
  // idCliente+período sozinhos seriam adivinháveis por qualquer um que soubesse
  // o ID_CLIENTE e tentasse datas — ver design.md, Risks & Concerns.
  return `promotor-relatorio/${idCliente}/${inicio}_${fim}-${randomUUID()}.pdf`;
}

/**
 * Arquiva o PDF gerado no S3 (RELPROM-45). Nunca lança — falha de upload vira
 * `{sucesso: false, motivo}`, mesmo padrão de erro-como-união de
 * `ObAdsIntegrationClient` (uma falha de arquivamento nunca pode derrubar o
 * envio do e-mail, que já aconteceu antes desta chamada).
 */
export default class S3StorageClient {
  static async uploadPdf(params: { idCliente: number; periodo: PeriodoRelatorio; pdf: Buffer }): Promise<ResultadoUpload> {
    const bucket = process.env.AWS_BUCKET_NAME ?? "";
    const regiao = process.env.AWS_REGION ?? "us-east-1";
    const chave = montarChave(params.idCliente, params.periodo);

    try {
      const client = new S3Client({
        region: regiao,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
        },
      });

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: chave,
          Body: params.pdf,
          ContentType: "application/pdf",
          ACL: "public-read",
        })
      );

      return { sucesso: true, url: `https://${bucket}.s3.${regiao}.amazonaws.com/${chave}` };
    } catch (erro) {
      return { sucesso: false, motivo: (erro as Error)?.message ?? "erro desconhecido no upload pro S3" };
    }
  }
}
