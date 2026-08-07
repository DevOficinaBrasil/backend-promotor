# Respostas ao review da migration — NOTIFICACAO_VISITA

**Para:** davi.marino@oficinabrasil.com.br (Ciência de Dados | DBA | Engenharia de Dados)
**Ref.:** Revisão da Migration — NOTIFICACAO_VISITA, 2026-08-06
**Data:** 2026-08-07
**Arquivo:** `scripts/migration-notificacao-visita.sql`

---

## Resumo

Valeu pelo review — as convenções do `dba-rules` foram todas aplicadas (TEXT, TIMESTAMPTZ, `COMMENT ON`, rollback documentado). Seguem as 11 respostas.

Dois pontos que mudam a versão que você mandou:

1. **O CHECK de `STATUS` precisa listar 7 valores, não 4.** Com 4 a migration quebra em produção. Detalhe na resposta 1 — é o único item obrigatório.
2. **Fomos com o padrão 100%: a FK sai.** Detalhe abaixo.

Sobre a conversão `TIMESTAMP → TIMESTAMPTZ`: não se aplica. A tabela não existe em produção, então não há dado antigo pra converter e nenhum fuso a assumir — o `CREATE` já sai no formato final.

---

## As 11 respostas

### 1. Valores de `STATUS` — incompleto ⚠️

O enum `StatusNotificacaoVisita` (`entities/NotificacaoVisita.ts`) tem **7** valores. Dois dos que ficaram de fora são gravados por code paths ativos:

| Status | Onde é escrito | Estava no CHECK? |
|---|---|---|
| `PENDENTE` | `notificacaoVisitaService.ts:62` | ✅ |
| `ENVIADO` | `notificacaoVisitaService.ts:155` | ✅ |
| `FALHOU` | `notificacaoVisitaService.ts:74, 98, 108, 128, 166, 184` | ✅ |
| `CONFIRMADO` | `visitaConfirmacaoService.ts:286` | ✅ |
| **`DISPENSADO`** | `notificacaoVisitaService.ts:81, 117` | ❌ |
| **`EXPIRADO`** | `envioGuards.ts:79` | ❌ |
| `REAGENDADO` | reservado (NOTIF-26), sem code path ainda | ❌ |

`DISPENSADO` **não é falha** — é envio suprimido de propósito, nos dois casos em que a regra de negócio manda não incomodar o reparador: endereço já atualizado nos últimos 3 meses, e a guarda antispam por destinatário. A distinção entre "não deu certo" e "decidimos não mandar" é justamente o que a coluna precisa registrar.

`EXPIRADO` vem do sweep oportunista em `envioGuards.ts`, que roda antes do check de notificação pendente.

Com o CHECK de 4 valores, **todo envio bloqueado por antispam estoura constraint violation**. Valor correto:

```sql
CHECK ("STATUS" IN ('PENDENTE','ENVIADO','CONFIRMADO','FALHOU','DISPENSADO','EXPIRADO','REAGENDADO'))
```

### 2. Valores de `CANAL`

Hoje só `WHATSAPP` (o enum `CanalNotificacao` tem um membro só). Mantivemos `EMAIL`/`SMS` reservados no CHECK como você propôs — não custa nada e evita migration futura.

### 3. `MESSAGE_ID` vs `PROVIDER_MESSAGE_ID`

Confirmado. Os dois vêm do retorno do channel de envio (`notificacaoVisitaService.ts:157-158`): `MESSAGE_ID` é o identificador interno do nosso sistema, `PROVIDER_MESSAGE_ID` é o que a API do WhatsApp devolve.

### 4. Reenvio

**Não existe path de reenvio hoje.** `notificarVisita` é chamado uma única vez, na criação da rota (`rotaService.ts:53`).

O `UNIQUE(ID_ROTA_PROMOTOR)` é intencional e é a implementação da regra AC1/NOTIF-09 ("exatamente 1 notificação por rota"). Uma segunda chamada para a mesma rota estoura o unique, cai no `catch` do serviço e degrada sem quebrar o caller — a notificação nunca pode derrubar a criação da rota.

Se um dia entrar reenvio, será `UPDATE` na mesma linha gerando novo `TOKEN_HASH`, e aí sim a pergunta sobre contar pro antispam fica relevante. Hoje não se aplica.

### 5. Formato do `TELEFONE_NORMALIZADO`

**Não é E.164.** São dígitos puros: `55DDDNNNNNNNNN` (país + DDD + assinante), **sem `+` e sem separadores**. Ex.: `5511999998888`. Máximo 13 dígitos.

Formato definido por `utils/telefone.ts`, que valida o DDD contra a alocação da ANATEL e falha fechado (retorna null) em qualquer número que não normalize. O `COMMENT` da coluna foi ajustado — a versão do report dizia "padrão E.164 a confirmar".

### 6. `CONFIRMADO_POR`

ID do **usuário reparador** que confirmou, tirado do claim `sub` do JWT de visita (`visitaConfirmacaoService.ts:288`). Não é sistema/agente. Vale registrar que não há re-autenticação no momento da confirmação — a posse do link é a credencial.

### 7. AC3: `FALHOU` sem `ID_USUARIO` e o antispam

**Intencional, e não queremos rastrear por telefone.**

Nesse path não existe destinatário nenhum — nem usuário, nem telefone. É a oficina que não tem ninguém cadastrado com celular. Não há pessoa contra quem aplicar antispam, então não há nada pra bloquear. O antispam protege o telefone de uma pessoa de mensagens repetidas; sem pessoa, o conceito não se aplica.

### 8. `TOKEN_HASH`

SHA-256 hex, 64 chars (`utils/visitaToken.ts::hashToken`). O token em claro são 32 bytes aleatórios (`crypto.randomBytes`) em base64url e **nunca é persistido** — só o digest. Um dump do banco não devolve link utilizável.

### 9. CHECKs de `ENVIADO_EM` / `CONFIRMADO_EM`

**Pode adicionar, são seguros.** O timing não é assíncrono: cada timestamp vai no mesmo `UPDATE` que muda o status.

- `ENVIADO_EM` + `STATUS = 'ENVIADO'`: `notificacaoVisitaService.ts:155-157`
- `CONFIRMADO_EM` + `STATUS = 'CONFIRMADO'`: `visitaConfirmacaoService.ts:286-287`

Já estão na versão nova da migration.

### 10. `UPDATED_AT`

Mantido pela **aplicação**, via `@UpdateDateColumn` do TypeORM, que emite a coluna em todo `save()`.

**Não criar trigger** — duplicaria a escrita sem ganho.

### 11. Janela temporal no índice

**Não precisa hoje.** As três queries da guarda antispam filtram por `(ID_USUARIO, STATUS)` mais `EXPIRA_EM` ou `CONFIRMADO_EM` — nenhuma toca `CREATED_AT`. O índice atual cobre o prefixo das três.

Se um dia virar gargalo, o candidato é `(ID_USUARIO, STATUS, CONFIRMADO_EM)`, que atende a query de "confirmou nos últimos 3 meses". `CREATED_AT` não entraria.

---

## Decisão: seguimos o padrão da casa, a FK sai

Você deu a opção e ficamos com o padrão 100%: **sem FK**, relacionamento implícito documentado no `COMMENT`. Não foi só conformidade — dois argumentos concretos:

**A FK nunca foi o que garantia a regra de negócio.** "1 notificação por rota" é o `UNIQUE(ID_ROTA_PROMOTOR)`, que continua. A FK só verificava existência da rota, o que a aplicação já garante — ela recebe a `RotaPromotor` já persistida.

**Ela já estava quebrando operação.** A v1 criou a FK sem `ON DELETE`, então qualquer `DELETE` em `ROTA_PROMOTOR` com notificação associada falhava:

```
QueryFailedError: update or delete on table "ROTA_PROMOTOR" violates
foreign key constraint "NOTIFICACAO_VISITA_ID_ROTA_PROMOTOR_fkey"
```

Reproduzível no teardown dos nossos testes de integração de rota.

Como em produção a tabela ainda não existe, o script simplesmente não cria a FK — não há nada a remover lá.

**Aproveitando:** o sintoma não é exclusivo dessa tabela. A cadeia `PROMOTOR → CAMPANHA_PROMOTOR → ROTA_PROMOTOR` inteira tem FKs herdadas sem `ON DELETE`, e três suítes de integração nossas falham por isso. Fora do escopo desta migration, mas se fizer sentido revisitar, a gente ajuda a mapear.

---

## Resumo do que mudou de lá pra cá

| Item | Report | Versão final |
|---|---|---|
| CHECK de `STATUS` | 4 valores | **7 valores** (bloqueador) |
| FK para `ROTA_PROMOTOR` | mantida, pendente de aprovação | **removida** — padrão da casa |
| `COMMENT` do telefone | "padrão E.164 a confirmar" | dígitos puros `55DDDNNNNNNNNN` |
| `COMMENT` do `UPDATED_AT` | "a confirmar" | `@UpdateDateColumn`, sem trigger |
| `COMMENT` do `CONFIRMADO_POR` | "usuário ou sistema — a confirmar" | claim `sub` do JWT de visita |
| CHECKs de timestamp | condicionados à resposta 9 | **incluídos** |
| TEXT / TIMESTAMPTZ / `COMMENT ON` / rollback | — | aplicados como no report |

Do nosso lado a `entities/NotificacaoVisita.ts` foi alinhada no mesmo commit: 7 colunas `varchar → text` e 5 `timestamp → timestamptz`, pra entity não divergir do banco (rodamos com `synchronize: false`, então divergência não quebra DDL, mas passa a mentir sobre o schema).

**Sem pendências de decisão do nosso lado — pode rodar.**
