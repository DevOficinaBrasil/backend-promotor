# Importador de Oficinas Context

**Gathered:** 2026-09-09
**Spec:** `.specs/features/importador-oficinas/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Endpoint backend que recebe uma planilha (`.xlsx`/`.csv`) de oficinas para uma campanha já existente, deduplica por CNPJ contra `MAIN_REGISTER.OFICINA`, geocodifica, vincula a oficina ao cliente (`EMPRESA_SLUG`) mesmo sem usuário, e tenta atribuir rota do promotor. Não inclui o botão/frontend (vive em `ob-ads`).

---

## Implementation Decisions

### Oficina com CNPJ desconhecido

- Cria uma nova oficina em `MAIN_REGISTER.OFICINA` a partir dos dados da planilha (não rejeita).

### Vínculo de oficina sem usuário ao cliente

- Nova tabela dedicada `CAMPANHAS_OB.OFICINA_IMPORTADA` (`ID_OFICINA` + `EMPRESA_SLUG`).
- Consultas existentes de "oficinas da comunidade" (`getComunityNearbyOficinas`, `getCommunityOficinas`, `countCommunityOficinas`) passam a fazer UNION com essa tabela — não criar um usuário/community-member sintético.

### Momento do import no wizard

- Sempre contra uma campanha já persistida (`ID_CAMPANHA` existente, com `EMPRESA_SLUG` resolvido a partir dela no servidor). Sem suporte a "rascunho antes de a campanha existir".

### Falha de geocodificação

- Rejeita a linha (não importa a oficina), reporta erro específico, demais linhas seguem processadas.

### Agent's Discretion

- Formato exato do relatório de resultado (JSON de resposta) — estruturado no design, sem restrição do usuário além de "commits padronizados" para rastreio.
- Nome do campo multipart do arquivo, nomes de schemas Zod, nome interno dos métodos de serviço.
- Divisão exata das tasks em commits (ficará explícita na fase de Tasks, não executada nesta sessão).

### Declined / Undiscussed Gray Areas → Assumptions

Ver seção **Assumptions & Open Questions** do `spec.md` — cobre: correspondência de cabeçalho (case/acento-insensível, ordem estrita), normalização de CNPJ, CNPJ duplicado no arquivo, granularidade de rejeição (linha vs. arquivo inteiro), teto de tamanho/linhas do arquivo, origem do `EMPRESA_SLUG` (resolvido no servidor, nunca do cliente), oficina pertencente a múltiplos clientes, e ausência de erro quando nenhum promotor está no raio.

---

## Specific References

Nenhuma referência visual/de produto específica foi trazida pelo usuário além do padrão de colunas do Jira (`NOME OFICINA; CNPJ; CEP; ENDEREÇO; NUMERO; ESTADO; CIDADE`) e da localização do botão (step 3 do wizard de campanha-promotores, repositório `ob-ads`).

---

## Deferred Ideas

- Endpoint de rollback/desfazer um lote de importação.
- Processamento assíncrono para arquivos muito grandes (acima do teto de 5.000 linhas).
- Atualizar dados de uma oficina já cadastrada a partir da planilha (hoje é só vínculo, nunca overwrite).
