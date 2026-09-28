# Disparo de Convite de Visita (Admin) Context

**Gathered:** 2026-09-28
**Spec:** `.specs/features/disparo-convite-visita-admin/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Uma tela só para admins no `ob-ads` que reusa o fluxo de campanha para promotores sobre **todas** as campanhas ativas. O admin segmenta oficinas da base Oficina Brasil por região e por critério do CRM, vê os promotores ligados ao cliente e à campanha, monta as rotas (inclusive com oficinas fora da comunidade da campanha) e clica em **Disparar comunicação**. Cada reparador selecionado recebe o convite de visita no WhatsApp, respeitando o teto diário informado no disparo. A visita só entra na rota do promotor quando o reparador aceita e confirma os dados. A regra "promotor só vê rota aceita" passa a valer para todas as campanhas.

---

## Implementation Decisions

### Limite de envio por dia

- O admin informa, no momento do disparo, o **teto de mensagens por dia** daquele disparo.
- A janela diária que já existe continua valendo (`NOTIFICACAO_HORA_ENVIO` a `NOTIFICACAO_HORA_ENVIO_FIM`, America/Sao_Paulo, sempre a partir do dia seguinte).
- O que passar do teto vai para os dias seguintes, sempre dentro da janela e espaçado nela.

### Visibilidade para o promotor

- **Global, para todas as campanhas:** uma rota em `BACKLOG` só aparece em `GET /campanha/ativa` com o convite aceito.
- Sai da lista hoje o que antes aparecia: rota sem notificação, `DISPENSADO` e `FALHOU`.
- **Vale para todas as rotas no deploy.** Não há exceção para rotas antigas.

### Segmentação

- **Região obrigatória:** UF + cidade, ou CEP + raio.
- **Segmentação do CRM obrigatória:** pelo menos um critério, aplicado sobre os contatos do **tenant 15 (Oficina Brasil)**, não sobre o tenant da comunidade da campanha.
- Com isso o universo é toda a base Oficina Brasil que o CRM conhece. "Fora da comunidade" quer dizer "fora da comunidade do cliente da campanha".

### Recusa

- Um botão **Recusar** entra no link do WhatsApp.
- Status novo `RECUSADO`: a rota sai da lista do promotor, o admin vê a recusa, e a oficina não é convidada de novo naquela campanha.

### Anti-spam, que vale para todos os fluxos

- A guarda de **endereço recente** (`enderecoRecente`, `OFICINA.DATA_ALTERACAO` com menos de 3 meses) **deixa de suprimir** o envio.
- **Convite em aberto** para a mesma oficina: não se manda outra mensagem. A rota nova **espera** e segue a resposta daquele convite: se ele for aceito, a rota fica aceita; se for recusado, fica recusada.
- **Confirmação há menos de 3 meses** (guarda mantida): a rota **entra como aceita** e aparece para o promotor, sem mensagem.

### Autenticação

- Os endpoints novos do backend-promotor (listar todas as campanhas, segmentar a base, disparar) exigem **JWT de admin** (`IS_ADMIN`).
- As rotas antigas não mudam.

### Agent's Discretion

- O desenho do fluxo de passos na tela de admin, reaproveitando os componentes de `components/wizard/`.
- De onde vem o nome do cliente. Há duas opções: `EMPRESA_SLUG → COMMUNITIES.Nome` no backend-promotor, ou `ID_CLIENT → NOME_CLIENTE` via `/admin/customers/findAll` no backend-ob-ads. A escolha fica para o Design.
- O modelo de persistência do "aguardando convite em aberto" e do "aceito por confirmação recente". Também fica para o Design.

### Declined / Undiscussed Gray Areas → Assumptions

Registradas na tabela de Assumptions da spec:

- Quais status contam como campanha "ativa".
- Oficina sem celular.
- Teto contra o fim da campanha.
- Onde fica a página pública.
- O template do WhatsApp.
- A chave da guarda de convite em aberto.

---

## Specific References

- Fluxo de referência: o wizard `ob-ads/components/wizard/CampanhaWizard.tsx` (Dados → Segmentação → Promotores/raio → Perguntas → Revisão), com o mapa Leaflet como palco.
- Limite diário de referência: `backend-communities/service/WhatsappDispatchService.ts:40-44` (`DISPATCH_DAILY_GLOBAL_LIMIT`). Serve só como vocabulário; o canal e a fila são outros.
- Endpoints de confirmação que já existem: `routes/VisitaRoute.ts` (`GET /visita/:token`, `POST /visita/confirmar`, `PUT /visita/endereco`).

---

## Deferred Ideas

- Remanejar e reenviar convites `EXPIRADO` ou `FALHOU`.
- Copy nova para o estado vazio do app do promotor ("você tem N visitas aguardando aceite").
- Autenticar as rotas antigas de `/campanha`, `/rota` e `/promotor`.
- Teto diário global somando todos os disparos.
