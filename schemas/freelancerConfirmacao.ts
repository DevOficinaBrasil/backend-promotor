import { z } from "zod";
import { cnpjValido, LIMITE_MAXIMO_LISTAGEM, LINHAS_ATIVIDADE, soDigitos } from "../utils/freelancerConfirmacao";

export const IdParams = z.object({ id: z.coerce.number().int().positive() });

export const ListarOficinasQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(LIMITE_MAXIMO_LISTAGEM).default(20),
  search: z.string().trim().max(100).optional(),
});

const texto = (max: number) => z.string().trim().max(max);

const UsuarioConfirmacao = z.object({
  ID_USUARIO: z.number().int().positive(),
  NOME: z.string().trim().min(1).max(255),
  EMAIL: z.string().trim().toLowerCase().email().max(255),
  TELEFONE: z
    .string()
    .trim()
    .max(45)
    .refine((v) => v === "" || soDigitos(v).length >= 8, "Telefone inválido"),
  ID_CARGO: z.number().int().positive(),
});

export const ConfirmarOficinaBody = z.object({
  OFICINA: z.object({
    CNPJ: z.string().refine(cnpjValido, "CNPJ inválido").transform(soDigitos),
    CEP: z.string().refine((v) => soDigitos(v).length === 8, "CEP deve ter 8 dígitos").transform(soDigitos),
    ENDERECO: texto(200).min(1),
    NUMERO: texto(200).min(1),
    COMPLEMENTO: texto(150).default(""),
    BAIRRO: texto(200).min(1),
    CIDADE: texto(150).min(1),
    ESTADO: z.string().trim().length(2).toUpperCase(),
    ID_RAMO_ATIVIDADE: z.number().int().positive(),
    LINHA_ATIVIDADE: z.array(z.enum(LINHAS_ATIVIDADE)).max(LINHAS_ATIVIDADE.length),
    QTD_ELEVADORES: z.number().int().min(0).max(999),
  }),
  USUARIO: UsuarioConfirmacao.optional(),
});

export type ConfirmarOficinaInput = z.infer<typeof ConfirmarOficinaBody>;
export type ListarOficinasInput = z.infer<typeof ListarOficinasQuery>;
