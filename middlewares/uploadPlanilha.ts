import multer from "multer";

const EXTENSOES_ACEITAS = [".xlsx", ".csv"];
const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Aceita apenas planilhas `.xlsx`/`.csv` pelo nome do arquivo. Mimetype de
 * planilha varia demais entre navegadores/SOs (CSV chega como "text/csv",
 * "application/vnd.ms-excel" ou "application/octet-stream" dependendo da
 * origem) para servir como critério confiável.
 */
export function isPlanilhaValida(filename: string): boolean {
  const nomeMinusculo = filename.toLowerCase();
  return EXTENSOES_ACEITAS.some((extensao) => nomeMinusculo.endsWith(extensao));
}

const uploadPlanilha = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!isPlanilhaValida(file.originalname)) {
      callback(new Error("Arquivo deve ser .xlsx ou .csv"));
      return;
    }
    callback(null, true);
  },
});

export default uploadPlanilha;
