# Confirmação de dados (painel de freelancers) — spec

Analisado: 2026-10-07 · Front: jornalOficinaBrasil `app/(freelancer)` (aba "Confirmação de dados").

Freelancer liga para a oficina, confere/corrige os dados e confirma. A confirmação aceita a visita
por telefone: toda rota ativa da oficina passa a ter NOTIFICACAO_VISITA CONFIRMADO com
`ORIGEM_ACEITE = 'FREELANCER'`. A lista é GLOBAL: não há vínculo freelancer-promotor.

## Requisitos (EARS)

- FRCD-01 WHEN a requisição chega em `/freelancer/confirmacao-dados/*` sem Bearer, THE SYSTEM SHALL responder 401; com token inválido, 403 (authMiddleware existente).
- FRCD-02 WHEN o usuário do JWT não tem a role FREELANCER (`MAIN_REGISTER.ROLE_USUARIO` + `ROLE`, ID_ROLE 4 / DESCRICAO FREELANCER), THE SYSTEM SHALL responder 403. A autenticação roda antes de qualquer validação (L-016).
- FRCD-03 WHEN `GET /oficinas?page&limit&search`, THE SYSTEM SHALL devolver `{ data: [{ID_OFICINA, NOME_FANTASIA, CNPJ, CIDADE, ESTADO}], total }` com oficinas distintas que tenham ao menos uma rota ativa (DELETED_AT nulo, STATUS fora de FINALIZADO/CANCELADO) sem NOTIFICACAO_VISITA CONFIRMADO, ordenadas por NOME_FANTASIA, ID_OFICINA, em uma query paginada.
- FRCD-04 `page >= 1`, `1 <= limit <= 50` (padrão 1 e 20), senão 400. `search` casa nome sem acento (translate(lower()), sem unaccent) ou CNPJ só dígitos.
- FRCD-05 WHEN `GET /oficinas/:id`, THE SYSTEM SHALL devolver `{ oficina, usuarios }` (QTD_ELEVADORES inteiro, nulo = 0; telefone do usuário = CELULAR senão TELEFONE) ou 404 se a oficina não estiver pendente.
- FRCD-06 WHEN `GET /usuarios/:id`, THE SYSTEM SHALL devolver `{ usuario: {ID_USUARIO, NOME, EMAIL, TELEFONE, ID_CARGO} }` se o usuário é de oficina pendente, senão 404.
- FRCD-07 WHEN `POST /oficinas/:id/confirmar` com payload válido (zod: CNPJ com dígitos verificadores, CEP 8 dígitos, linhas em {Leve, Pesada, Moto, Agricola}, QTD 0..999), THE SYSTEM SHALL, numa transação com lock da oficina: atualizar OFICINA (DATA_ATUALIZACAO_ENDERECO = now()), trocar LINHA_ATIVIDADE só se mudou, atualizar o USUARIO opcional, e fazer upsert (UNIQUE por ID_ROTA_PROMOTOR) de CONFIRMADO / FREELANCER / CONFIRMADO_EM / CONFIRMADO_POR para cada rota pendente.
- FRCD-08 Payload inválido 400; oficina inexistente 404; sem rota pendente 409; CNPJ de outra oficina 409; e-mail de outro usuário 409; usuário de outra oficina 422. Erros no formato `{ message }`, sem stack, log sem PII.
- FRCD-09 A migração `scripts/migration-freelancer-origem-aceite.sql` recria `CHK_NOTIFICACAO_VISITA_ORIGEM_ACEITE` aceitando FREELANCER. Não é executada pelo agente.

## Fora de escopo
Colunas novas em OFICINA/USUARIO (o trigger de log com OLD.* quebraria o UPDATE). FK nova.
