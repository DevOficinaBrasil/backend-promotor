# Relatório Semanal de Promotores — Context

**Gathered:** 2026-10-28
**Spec:** `.specs/features/relatorio-semanal-promotores/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Automatizar a geração e o envio por e-mail do relatório semanal de visitas de promotores (CON26-325), hoje gerado manualmente toda quinta/sexta via agente de IA consultando o banco direto. O relatório replica o conteúdo e a ordem das 7 seções do modelo em anexo (capa, visão geral, assertividade/performance geral, performance por promotor, resumo dos cancelamentos, destaques do campo/observações, próximos passos) e é enviado por e-mail ao(s) admin(s) do cliente dono do módulo de promotores. A solução deve ser escalável para qualquer cliente que tenha o módulo habilitado, não só a SKF.

---

## Implementation Decisions

### Flag de módulo habilitado (escalabilidade)
- Reusar o sistema genérico `Module` / `ClienteModule` já existente no backend-ob-ads (`backend-ob-ads/src/domain/entities/{Module,ClienteModule,UsuarioModule}.ts`), criando uma linha nova `"Promotores"` em `module` e vinculando os clientes elegíveis via `cliente_module`. Mesmo padrão já usado para o módulo de comentários (`sql/2026-09-con26-156-modulo-comentarios-global.sql`).
- Cliente "tem o módulo" ⇔ existe linha ativa em `cliente_module` apontando pro módulo `"Promotores"`. A existência de uma `Campanha` ativa vinculada ao cliente continua sendo pré-requisito para haver dado a relatar, mas não substitui a flag.

### Destinatário do e-mail
- Todos os `Usuario` com `IS_ADMIN = 1` vinculados ao cliente (mesma resolução de cliente→usuários do `CommunityReportEmailService`, só que **sem** o filtro que hoje exclui admins — aqui o filtro é invertido: manda só para quem é admin).
- Se o cliente tiver múltiplos admins: **um único envio** por cliente/período, com todos os e-mails de admin no `To`.
- Se o cliente não tiver nenhum admin resolvido: não há envio possível — vira falha logada (ver Declined/Assumptions).

### Formato do relatório
- PDF anexado ao e-mail, replicando visualmente o layout e a ordem de seções do PDF modelo (capa dark-blue, cards de métricas, tabela por promotor, tabela de cancelamentos, cards de destaques, cards de próximos passos).
- Geração via renderização HTML → PDF (lib já disponível no projeto: Playwright), não via reconstrução manual de PDF (pdf-lib ficaria limitado pro layout com cards/tabelas).
- E-mail em si pode ter corpo simples (ex.: "segue em anexo o relatório semanal de promotores"); o conteúdo rico vive no PDF.

### Período coberto
- Janela fixa de 7 dias corridos: sexta-feira (dia do envio) cobre os dados de sexta anterior até a quinta-feira imediatamente anterior ao envio (dia completo), corte às 23:59:59 America/Sao_Paulo.
- Não é acumulado desde o envio anterior — se um envio falhar numa semana, a semana seguinte cobre só os 7 dias dela, sem tentar recuperar o gap (simplicidade > acúmulo).
- O relatório também traz, à parte, o acumulado desde o início da campanha (replicando os números "acumulado" do PDF modelo) — isso é cumulativo por natureza e não depende da janela de 7 dias.

### Separação por campanha
- Ponto ambíguo no ticket, resolvido em discuss: um cliente com mais de uma `Campanha` ativa **não** tem suas métricas agregadas num único bloco. O relatório continua sendo 1 PDF e 1 e-mail por cliente (mantém a decisão de destinatário/envio único), mas internamente ganha um bloco de dados completo por campanha (visão geral, assertividade, performance por promotor, cancelamentos, destaques do campo, próximos passos), identificado pelo nome da campanha.
- Cliente com 1 campanha ativa (caso da SKF hoje): continua um único bloco, sem mudança visível.
- Rationale: agregar misturaria métricas de campanhas com maturidades diferentes (ex.: campanha nova de poucos dias junto de uma campanha consolidada), distorcendo assertividade e comparações por promotor.

### Guarda de ambiente (dev vs. produção)
- Fora de produção (`NODE_ENV !== "production"`), o envio real do e-mail vai só para uma lista fixa de destinatários de teste definida em código (ex.: `DEV_REPORT_RECIPIENTS`), nunca para os admins reais do cliente.
- Os e-mails de admin que seriam os destinatários reais são registrados em log (não "print" literal no console de produção — log estruturado, seguindo a convenção de logging do repo), pra permitir validar a resolução de destinatários sem risco de vazar e-mail de teste pro cliente real.
- Lista de teste vazia fora de produção ⇒ não envia nada pro cliente, loga a condição (mesmo tratamento de "cliente sem admin resolvido").
- Em produção, a lista de teste nunca é usada — sempre os admins reais.

### Cliente sem movimentação no período
- Envia o relatório mesmo com todos os contadores zerados (concluídas, canceladas, abertas na rota podem ainda ser > 0 mesmo sem conclusões/cancelamentos novos). Preferência por transparência: zero visível é mais confiável que silêncio.

### Seção "Destaques do campo" (observações dos promotores)
- Listagem determinística: para cada visita concluída ou cancelada no período que tenha o campo `OBS` preenchido, lista promotor + oficina + cidade + texto da observação, agrupado por status (concluídas com observação / canceladas com justificativa).
- **Sem** tentativa de interpretação textual livre (nada de inferir "oficina fechada"/"fora do segmento" por regra de palavra-chave) — isso é o que o relatório manual faz por leitura humana e fica fora do escopo automatizado do MVP. Fica registrado como Deferred Idea.

### Múltiplos admins (detalhe de envio)
- Um único e-mail por cliente/período, todos os admins resolvidos no campo `To`.

### Endpoint de disparo manual (testes + futura integração de frontend)
- Novo endpoint administrativo (`/admin/*`, `adminAuthMiddleware`, convenção AD-004) que roda a mesma lógica de geração usada pelo cron, para um cliente específico, sob demanda — sem esperar sexta-feira.
- Retorna o PDF gerado na própria resposta (síncrono), pra servir tanto teste manual quanto uma futura tela administrativa que queira pré-visualizar/baixar o relatório.
- Respeita a mesma guarda dev/produção do envio por e-mail (lista fixa em dev, admins reais em produção) — chamar o endpoint em dev nunca manda e-mail pro admin do cliente.
- Suporta um modo somente-pré-visualização (gera e retorna o PDF sem enviar e-mail) e aceita período customizado opcional, pra depuração sem depender da janela fixa de 7 dias.

### Agent's Discretion
- Mecanismo exato de integração cross-service (backend-promotor chamando backend-ob-ads para resolver admins e/ou disparar o e-mail via SES já configurado lá, versus backend-promotor ganhar seu próprio client de e-mail) fica a critério da fase de Design — não é uma decisão de produto, é arquitetura de implementação.
- Nome exato do schedule (horário do cron na sexta-feira, formato do nome do job) fica a critério da implementação, respeitando a convenção `node-cron` + flag `*_ENABLED` já usada em `schedule/outboxNotificacaoCron.ts`.
- Deduplicação (evitar reenvio se o cron rodar duas vezes na mesma janela) e trilha de auditoria (histórico de relatórios gerados/enviados) ficam a critério do Design, mas **devem existir** — requisito funcional coberto no spec (RELPROM-09, RELPROM-10), mecanismo concreto (nova tabela vs. reaproveitar `CommunityReportConfig`-like) é decisão de Design.

### Declined / Undiscussed Gray Areas → Assumptions
- **Falha ao resolver admins ou ao enviar o e-mail de um cliente:** não derruba o processamento dos demais clientes; erro é logado com `[relatorioPromotores]` e tag do cliente, sem retry automático na mesma execução — a run seguinte (semana seguinte) cobre o próximo período normalmente. Rationale: consistente com o padrão já usado em `rotaService.notificarRotasCriadas` (nunca derruba o processo por causa de notificação) e com a convenção de logging do repo.
- **Validação do e-mail do admin antes de enviar:** formato de e-mail inválido/vazio é tratado como falha de resolução de destinatário para aquele cliente (mesmo tratamento do item acima), não bloqueia os demais.
- **Autenticação da chamada cross-service** (se o Design optar por uma rota HTTP nova no ob-ads): segue o padrão de rota interna já existente (`CommunityReportInternalRoutes.ts`), não authService de usuário final.

---

## Specific References

- Modelo visual e de conteúdo: PDF anexado ao ticket CON26-325 ("SKF — Parcial 09 10 a 22 10.pdf"), 7 páginas, ordem: capa → visão geral → assertividade → quem visitou (por promotor) → canceladas → destaques do campo → próximos passos.
- Padrão de relatório periódico + cron + e-mail a seguir como referência de implementação (Design): `backend-ob-ads/src/appplication/services/communityReport/*` (`CommunityReportConfigRepository`, `CommunityReportService`, `CommunityReportEmailService`, `schedule-community-report.ts`).

---

## Deferred Ideas

- Interpretação textual automática das observações (keyword matching pra gerar cards tipo "base com oficinas que não existem mais", "oficinas fora do perfil") — fica pra uma v2, fora do MVP.
- Qualquer canal de envio além de e-mail (ex.: WhatsApp do admin) — fora de escopo; ticket pede e-mail.
- Dashboard/self-service pro admin configurar frequência/destinatários — fora de escopo; ticket especifica fluxo automático fixo.
