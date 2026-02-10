import 'express';

declare global {
    namespace Express {
        interface Request {
            user: {
                ID_USUARIO?: number;

                ID_FORUM?: number | null;
                ID_OFICINA?: number | null;
                ID_ENDERECO_RESIDENCIAL?: number | null;

                NOME: string | null;
                NICK_NAME: string | null;
                EMAIL: string;

                CPF: string | null;
                SEXO: string | null;
                NASCIMENTO: string | null;

                ESCOLARIDADE?: string | null;

                CARGO: number;

                AREA_PROFISSIONAL?: string | null;

                ADMIN: number | null;

                CELULAR: string | null;
                TELEFONE?: string | null;

                FORUM: string;

                LOGIN?: string;

                TERMOS?: number | null;

                RECEBER_INFO?: string | null;
                RECEBERINFO_PARCEIROS?: string | null;

                EXCLUIDO?: string;
                ATIVO: string;

                PROFILE_PICTURE?: string | null;

                APROVADO_ADMIN?: number;

                PSW: string;
                SENHA: string;

                MALA_DIRETA?: string | null;

                NOTIFICATION_TOKEN?: string | null;

                DATA_ALTERACAO?: Date | null;

                ZF?: boolean | null;

                UTM_SOURCE?: string | null;
                UTM_MEDIUM?: string | null;
                UTM_CAMPAIGN?: string | null;

                roleUsuario: {
                    ID_ROLE: number;
                    DESCRICAO: string;
                }[];
            }
        }
    }
}

export {};