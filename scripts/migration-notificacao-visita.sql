-- ============================================================================
-- Migration: Notificação de Visita e Confirmação do Reparador
-- Data: 2026-08-05 | Revisão: 2026-08-07 (padrão dba-rules)
--
-- Pressupõe que a tabela ainda NÃO existe no ambiente alvo — a feature não foi
-- a produção. O IF NOT EXISTS é rede de segurança contra execução dupla, não
-- caminho de atualização: se a tabela já existir, o script vira no-op e o schema
-- precisa ser conferido à mão.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS "CAMPANHAS_OB"."NOTIFICACAO_VISITA" CASCADE
-- (remove tabela, índices, constraints e a sequence do SERIAL)
--
-- REGRA DE EDIÇÃO: nenhum statement deste arquivo contém linha em branco ou
-- comentário no meio, e nenhum comentário contém ponto e vírgula. Não é
-- estilo. Clientes SQL (o plugin de banco do VSCode entre eles) dividem o
-- script em statements por linha em branco e por ponto e vírgula, sem entender
-- comentário, e mandam ao servidor um CREATE TABLE cortado na metade, que falha
-- com "syntax error at end of input". Toda explicação fica FORA do statement.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Tabela
--
-- Convenções dba-rules aplicadas: nunca VARCHAR (TEXT + justificativa no
-- COMMENT), nunca TIMESTAMP naive (TIMESTAMPTZ), sem FK (relacionamento
-- implícito, integridade referencial a cargo da aplicação).
--
-- Notas do corpo do CREATE, mantidas aqui fora para que o statement fique sem
-- linha em branco e sem comentário no meio (ver aviso do cabeçalho):
--
--   ID_ROTA_PROMOTOR  Sem FK para ROTA_PROMOTOR por padrão da casa. O UNIQUE é
--                     o que garante 1 notificação por rota (AC1/NOTIF-09) --
--                     nunca foi a FK.
--   ID_USUARIO        Nullable junto de TOKEN_HASH e EXPIRA_EM: a linha é
--   TOKEN_HASH        inserida em PENDENTE (AC1) antes de resolver o
--   EXPIRA_EM         destinatário (AC2) ou emitir token (AC5), e o path AC3
--                     ("sem destinatário com telefone") persiste FALHOU sem
--                     nenhum dos três.
--   CHK_..._STATUS    Os 7 valores do enum StatusNotificacaoVisita
--                     (entities/NotificacaoVisita.ts). DISPENSADO e EXPIRADO
--                     são gravados por code paths ativos e NÃO podem faltar.
--                     DISPENSADO = envio suprimido de propósito (endereço
--                     fresco AC26, antispam AC27-AC29) e não é falha.
--                     EXPIRADO = sweep oportunista em envioGuards.
--                     REAGENDADO está reservado para NOTIF-26, sem code path.
--   CHK_..._CANAL     EMAIL/SMS reservados. Hoje a aplicação só emite WHATSAPP.
--   CHK_..._TOKEN_..  Token emitido <=> tem expiração. As duas colunas são
--                     sempre gravadas no mesmo UPDATE (AC5) e nenhum path
--                     limpa uma sem a outra.
--   CHK_..._*_EM      Timestamps gravados no mesmo UPDATE que muda o STATUS,
--                     nunca de forma assíncrona, então a consistência pode ser
--                     exigida pelo banco.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "CAMPANHAS_OB"."NOTIFICACAO_VISITA" (
  "ID_NOTIFICACAO_VISITA" SERIAL PRIMARY KEY,
  "ID_ROTA_PROMOTOR" INT NOT NULL UNIQUE,
  "ID_USUARIO" INT,
  "CANAL" TEXT NOT NULL DEFAULT 'WHATSAPP',
  "STATUS" TEXT NOT NULL DEFAULT 'PENDENTE',
  "TELEFONE_NORMALIZADO" TEXT,
  "TOKEN_HASH" TEXT,
  "EXPIRA_EM" TIMESTAMPTZ,
  "ERRO_ENVIO" TEXT,
  "MESSAGE_ID" TEXT,
  "PROVIDER_MESSAGE_ID" TEXT,
  "ENVIADO_EM" TIMESTAMPTZ,
  "CONFIRMADO_EM" TIMESTAMPTZ,
  "CONFIRMADO_POR" INT,
  "CONFIRMADO_IP" TEXT,
  "ENDERECO_ATUALIZADO" BOOLEAN NOT NULL DEFAULT FALSE,
  "CREATED_AT" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "UPDATED_AT" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CHK_NOTIFICACAO_VISITA_STATUS"
    CHECK ("STATUS" IN ('PENDENTE', 'ENVIADO', 'CONFIRMADO', 'FALHOU', 'DISPENSADO', 'EXPIRADO', 'REAGENDADO')),
  CONSTRAINT "CHK_NOTIFICACAO_VISITA_CANAL"
    CHECK ("CANAL" IN ('WHATSAPP', 'EMAIL', 'SMS')),
  CONSTRAINT "CHK_NOTIFICACAO_VISITA_TOKEN_EXPIRA"
    CHECK (("TOKEN_HASH" IS NULL) = ("EXPIRA_EM" IS NULL)),
  CONSTRAINT "CHK_NOTIFICACAO_VISITA_ENVIADO_EM"
    CHECK ("STATUS" <> 'ENVIADO' OR "ENVIADO_EM" IS NOT NULL),
  CONSTRAINT "CHK_NOTIFICACAO_VISITA_CONFIRMADO_EM"
    CHECK ("STATUS" <> 'CONFIRMADO' OR "CONFIRMADO_EM" IS NOT NULL)
);


-- ---------------------------------------------------------------------------
-- 2. Documentação no catálogo
-- ---------------------------------------------------------------------------
COMMENT ON TABLE "CAMPANHAS_OB"."NOTIFICACAO_VISITA" IS
  'Notificação de visita de promotor ao reparador + confirmação do endereço. Fluxo: PENDENTE -> ENVIADO -> CONFIRMADO/EXPIRADO, ou PENDENTE -> FALHOU/DISPENSADO. AC1 cria em PENDENTE antes de resolver destinatário; AC3 persiste FALHOU sem destinatário; guardas de pré-envio persistem DISPENSADO.';

COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."ID_NOTIFICACAO_VISITA" IS
  'PK artificial da notificação.';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."ID_ROTA_PROMOTOR" IS
  'Rota de promotor que gerou a notificação. Relacionamento implícito com CAMPANHAS_OB.ROTA_PROMOTOR (sem FK, padrão legado da casa — integridade referencial garantida pela aplicação). UNIQUE = exatamente 1 notificação por rota (AC1); não existe reenvio, uma segunda notificação para a mesma rota é impedida aqui.';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."ID_USUARIO" IS
  'ID do usuário reparador destinatário. Relacionamento implícito com MAIN_REGISTER.USUARIO (schema read-only). Nullable: AC1/AC2 resolvem destinatário depois; AC3 grava FALHOU sem destinatário, caso em que não há pessoa contra quem aplicar antispam.';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."CANAL" IS
  'Canal de envio. Hoje apenas WHATSAPP; EMAIL e SMS reservados no CHECK.';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."STATUS" IS
  'Estado do fluxo: PENDENTE, ENVIADO, CONFIRMADO, FALHOU, DISPENSADO (envio suprimido de propósito, não é falha), EXPIRADO, REAGENDADO (reservado, sem code path).';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."TELEFONE_NORMALIZADO" IS
  'Telefone do destinatário normalizado como dígitos puros 55DDDNNNNNNNNN (país + DDD + assinante), sem "+" e sem separadores — NÃO é E.164. Máximo 13 dígitos. Ver utils/telefone.ts.';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."TOKEN_HASH" IS
  'Digest SHA-256 hex (64 chars) do token do link; o token em claro (32 bytes aleatórios em base64url) nunca é persistido. Chave de lookup única do endpoint de exchange; NULL enquanto não emitido (AC5). TEXT sem limite por padrão da casa.';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."EXPIRA_EM" IS
  'Validade do token: emissão + 168h. NULL enquanto token não emitido. TIMESTAMPTZ é obrigatório aqui — expiração sem fuso dependeria do timezone da sessão que gravou.';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."ERRO_ENVIO" IS
  'Motivo da falha de envio, ou o motivo da supressão quando STATUS = DISPENSADO.';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."MESSAGE_ID" IS
  'Identificador interno da mensagem no nosso sistema.';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."PROVIDER_MESSAGE_ID" IS
  'Identificador retornado pelo provider de mensageria (API WhatsApp).';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."ENVIADO_EM" IS
  'Timestamp (com fuso) do envio efetivo. Gravado no mesmo UPDATE que seta STATUS = ENVIADO.';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."CONFIRMADO_EM" IS
  'Timestamp (com fuso) da confirmação. Gravado no mesmo UPDATE que seta STATUS = CONFIRMADO.';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."CONFIRMADO_POR" IS
  'ID do usuário reparador que confirmou, vindo do claim "sub" do JWT de visita (não re-autenticado no momento da confirmação).';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."CONFIRMADO_IP" IS
  'IP de origem da confirmação (TEXT, sem limite para não restringir IPv6).';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."ENDERECO_ATUALIZADO" IS
  'Indica se o reparador corrigiu o endereço durante a confirmação.';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."CREATED_AT" IS
  'Data/hora de criação (TIMESTAMPTZ).';
COMMENT ON COLUMN "CAMPANHAS_OB"."NOTIFICACAO_VISITA"."UPDATED_AT" IS
  'Data/hora da última atualização (TIMESTAMPTZ). Mantido pela aplicação via @UpdateDateColumn do TypeORM — não criar trigger, duplicaria a escrita.';


-- ---------------------------------------------------------------------------
-- 3. Índices
-- ---------------------------------------------------------------------------

-- Suporta o scan antispam por destinatário (NOTIF-28/29/30), que filtra por
-- ID_USUARIO e STATUS a cada criação de rota. As três queries do guard usam
-- esse prefixo. Nenhuma filtra por CREATED_AT, então não há ganho em estendê-lo.
CREATE INDEX IF NOT EXISTS "IDX_NOTIFICACAO_VISITA_USUARIO_STATUS"
  ON "CAMPANHAS_OB"."NOTIFICACAO_VISITA" ("ID_USUARIO", "STATUS");

-- UNIQUE: TOKEN_HASH é a chave de lookup single-row do endpoint de exchange.
-- Postgres trata NULLs como distintos, então a coluna nullable permite
-- várias linhas PENDENTE/FALHOU/DISPENSADO sem token coexistirem.
CREATE UNIQUE INDEX IF NOT EXISTS "IDX_NOTIFICACAO_VISITA_TOKEN_HASH"
  ON "CAMPANHAS_OB"."NOTIFICACAO_VISITA" ("TOKEN_HASH");
