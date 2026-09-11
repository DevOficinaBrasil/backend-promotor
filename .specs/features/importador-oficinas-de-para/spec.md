# Importador de Oficinas com De-Para e Relatório em Stream Specification

**Antecessora:** `.specs/features/importador-oficinas/` — esta spec **revoga** `IMPORT-01` e
`IMPORT-03` daquela (cabeçalho fixo de 8 colunas na mesma ordem, arquivo inteiro rejeitado
quando diverge). Todos os demais requisitos `IMPORT-NN` continuam valendo sem alteração.

## Problem Statement

O importador de oficinas só aceita uma planilha com exatamente 8 colunas, nos mesmos nomes e na
mesma ordem — qualquer divergência rejeita o arquivo inteiro, e o cliente precisa reformatar a
própria base para caber no molde. O módulo de automação já resolveu esse problema com um de-para
que lê o cabeçalho real da planilha e deixa o usuário apontar cada coluna. Além disso a
importação hoje é uma request opaca: com geocodificação serializada em 1 req/s, um arquivo de
centenas de linhas fica minutos sem devolver nada, e o usuário não sabe se travou.

## Goals

- [ ] Botão único "Importar oficinas" no passo 3, abrindo um modal que conduz anexo → de-para → revisão
- [ ] Qualquer planilha `.xlsx`/`.xls`/`.csv` é aceita, desde que o usuário aponte as colunas de CNPJ e CEP
- [ ] Endpoint que recebe linhas já mapeadas em JSON e responde em stream, sem validação de cabeçalho
- [ ] Barra de progresso horizontal alimentada pelo stream, separando oficinas novas de oficinas já cadastradas na Oficina Brasil
- [ ] Zero mudança nas regras de linha já especificadas e verificadas em `importador-oficinas`

## Out of Scope

| Feature | Reason |
|---|---|
| Remover `POST /oficina/import` (multipart, cabeçalho fixo) | `ob-ads` aponta para a API de produção por URL fixa (`api_promotores`), então derrubar o endpoint antigo quebraria o dashboard já publicado no intervalo entre os dois deploys. Fica marcado como *deprecated* na documentação da rota; a remoção é uma limpeza posterior. |
| Processamento assíncrono em fila com job id | O stream mantém a request viva e reporta progresso; trocar por fila é uma mudança de arquitetura maior do que o pedido. Ver a assumption sobre queda de conexão. |
| Retomar uma importação interrompida do ponto em que parou | A reimportação do mesmo arquivo já é idempotente (`IMPORT-13`/`IMPORT-14`/`IMPORT-19`), o que cobre o caso sem estado de retomada. |
| Editar/atualizar oficina existente com os dados da planilha | Continua valendo o recorte de `importador-oficinas`: dedup por CNPJ é só vínculo. |
| Autenticação / isolamento por tenant no endpoint novo | A API inteira é pública hoje (`CONCERNS.md` SEC-01); o endpoint novo nasce com a mesma exposição dos demais. Fechar isso é uma feature própria, não um puxadinho desta. |
| Pré-visualizar no mapa as oficinas antes de importar | Não pedido; a revisão do modal já mostra contagem e amostra das linhas. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
|---|---|---|---|
| Onde a planilha é transformada | No browser: SheetJS lê o cabeçalho, o de-para roda no cliente e o front envia um array JSON de oficinas já mapeadas | Pedido explícito do usuário: "mesmo padrão de importar contatos do módulo de automação", que faz exatamente isso em `contactImport.js` | y (usuário) |
| Campos obrigatórios no de-para | `CNPJ` e `CEP` | CNPJ é a chave de deduplicação (`IMPORT-07`) e CEP é a única entrada da geocodificação (`IMPORT-11`); sem os dois a linha não tem como ser processada. Os outros 6 campos só são usados ao criar uma oficina inédita | n |
| Botão "Baixar modelo" | Removido da tela junto com o gerador `oficinaImportTemplate.ts` e seu teste | Decisão do usuário. Com de-para qualquer planilha serve, e um modelo na tela sugeriria de novo um formato obrigatório | y (usuário) |
| Formato do stream | NDJSON (uma linha JSON por evento) no corpo de uma resposta `POST`, lida no browser com `fetch` + `ReadableStream` | `EventSource`/SSE só faz `GET`, e o payload do de-para é um `POST` com corpo grande. NDJSON evita o protocolo de envelope do SSE sem perder nada | n |
| Frequência dos eventos de progresso | No máximo um evento a cada 500ms, mais um evento garantido no início e outro no fim | Uma planilha de 5.000 linhas emitiria 5.000 eventos; o throttle mantém a barra fluida sem inundar a conexão | n |
| Teto de linhas | 5.000 itens no array, rejeitado antes de processar qualquer linha | Mantém o mesmo teto de `importador-oficinas` (`IMPORT-04`), agora contado no array em vez das linhas do arquivo | n |
| Queda de conexão no meio do stream | As linhas já processadas permanecem gravadas; a importação não é revertida e o usuário reimporta o mesmo arquivo | Reverter exigiria transação sobre a importação inteira, o que conflita com o processamento concorrente por linha já implementado. A reimportação é idempotente por `IMPORT-13`/`IMPORT-19`, então repetir o arquivo é seguro e converge | n |
| Duração da importação | Aceita como está; o stream mantém a conexão com tráfego contínuo, o que evita o corte por ociosidade | A geocodificação é serializada em 1 req/s por `GeolocationService` (política do Nominatim), então um arquivo grande de oficinas inéditas leva dezenas de minutos. Isso é uma limitação herdada, não introduzida aqui, e a fila assíncrona está fora de escopo | n |
| Contadores da barra | "Novas no sistema" = `oficinas_criadas`; "Já cadastradas na Oficina Brasil" = `oficinas_vinculadas_existentes` | São exatamente os dois contadores que `ImportResult` já produz, com o significado que o usuário descreveu | n |
| Endpoint antigo | Mantido e marcado como *deprecated*, sem mudança de comportamento | Ver Out of Scope: o dashboard em produção ainda o chama até o deploy do front novo | y (usuário, via D1/D2 do context.md) |

**Open questions:** none — todas resolvidas ou registradas acima.

---

## Dimensões implícitas (sweep de escopo Large)

| Dimensão | Resolução |
|---|---|
| Validação de entrada e limites | `API-02`, `API-03`, `UI-06`, `UI-09` |
| Falha parcial | `API-09` (erro de linha não aborta o lote), `STREAM-06` |
| Idempotência / retry | N/A nesta spec porque já é garantida por `IMPORT-13`/`IMPORT-14`/`IMPORT-19`, que esta feature não altera |
| Auth e rate limit | N/A porque a API não tem autenticação em nenhuma rota (`CONCERNS.md` SEC-01) e fechar isso está fora de escopo |
| Concorrência / ordenação | `API-10` (concorrência de linha preservada), `STREAM-04` (contadores monotônicos) |
| Ciclo de vida do dado | N/A porque nenhum dado novo é criado por esta feature — ela muda o transporte, não o que é gravado |
| Observabilidade | `STREAM-07` (evento final carrega o `ImportResult` completo, incluindo `erros`) |
| Falha de dependência externa | `API-09` reaproveita o tratamento de falha de geocodificação já especificado em `IMPORT-12` |
| Integridade de transição de estado | N/A porque a importação não tem máquina de estados; cada linha é independente |

---

## User Stories

### P1: Modal único de importação com de-para ⭐ MVP

**User Story**: Como cliente (indústria), quero anexar minha planilha do jeito que ela já existe e
apontar qual coluna é qual, para não precisar reformatar a base antes de importar.

**Why P1**: É a dor que originou o pedido. Sem o de-para, o resto da feature não muda nada para o usuário.

**Acceptance Criteria**:

1. WHILE o passo 3 do wizard está aberto, o sistema SHALL exibir um único botão de importação de oficinas, rotulado "Importar oficinas"
2. The sistema SHALL NOT exibir o botão "Baixar modelo" em nenhum passo do wizard
3. WHEN o usuário aciona "Importar oficinas" THEN o sistema SHALL abrir um modal cujo primeiro passo descreve, em texto, que basta anexar a planilha e apontar as colunas
4. The modal SHALL usar os tokens de cor e tipografia de `wizard-theme.ts`, e SHALL NOT usar as cores literais de `ImportContactsModal`
5. WHEN o usuário anexa um arquivo `.xlsx`, `.xls` ou `.csv` THEN o sistema SHALL exibir os rótulos da primeira linha do arquivo como opções de coluna para cada campo de oficina
6. IF o arquivo anexado não tem extensão `.xlsx`, `.xls` ou `.csv` THEN o sistema SHALL exibir "Formato não suportado" e SHALL NOT avançar para o passo de mapeamento
7. WHEN o passo de mapeamento é aberto THEN o sistema SHALL pré-selecionar, para cada campo, a primeira coluna ainda não usada cujo rótulo normalizado (minúsculo, sem acento, sem pontuação) coincide com um dos apelidos daquele campo
8. WHILE uma coluna está atribuída a um campo, o sistema SHALL desabilitar essa coluna nos seletores dos demais campos
9. IF `CNPJ` ou `CEP` não estão mapeados THEN o sistema SHALL manter desabilitado o avanço para a revisão
10. WHEN o usuário avança para a revisão THEN o sistema SHALL exibir a quantidade de linhas da planilha e a quantidade de linhas que serão enviadas
11. IF o arquivo tem cabeçalho mas nenhuma linha de dados THEN o sistema SHALL exibir "O arquivo não tem nenhuma linha de dados" e SHALL NOT avançar para o mapeamento
12. WHILE uma linha tem a célula de CNPJ ou a de CEP vazia, o sistema SHALL excluir essa linha do envio
13. WHEN existem linhas excluídas do envio THEN o sistema SHALL exibir na revisão quantas linhas foram ignoradas

**Independent Test**: anexar uma planilha com as colunas fora de ordem, com nomes diferentes e com uma
coluna extra; verificar que o modal lê o cabeçalho, pré-seleciona o que reconhece, permite corrigir o
resto e libera o envio assim que CNPJ e CEP estão apontados.

---

### P1: Endpoint de importação por linhas mapeadas ⭐ MVP

**User Story**: Como sistema, quero receber as oficinas já mapeadas em JSON, para que o contrato
de importação não dependa mais da forma do arquivo original.

**Why P1**: É o contrato que sustenta o de-para; sem ele o front não tem para onde enviar.

**Acceptance Criteria**:

1. WHEN o cliente envia `POST /oficina/import-stream` com `ID_CAMPANHA` e um array `oficinas` válido THEN o sistema SHALL processar cada item do array como uma linha de importação
2. IF o corpo não obedece ao schema (`ID_CAMPANHA` inteiro positivo; `oficinas` array não vazio; cada item com `CNPJ` e `CEP` string não vazia) THEN o sistema SHALL responder 400 e SHALL NOT processar nenhuma linha
3. IF o array `oficinas` tem mais de 5.000 itens THEN o sistema SHALL responder 400 e SHALL NOT processar nenhuma linha
4. The sistema SHALL resolver `EMPRESA_SLUG` a partir do `ID_CAMPANHA` recebido, e SHALL NOT aceitar `EMPRESA_SLUG` enviado pelo cliente
5. IF `ID_CAMPANHA` não corresponde a uma campanha existente com `DELETED_AT` nulo THEN o sistema SHALL responder 404 antes de processar qualquer linha
6. IF a campanha encontrada não possui `EMPRESA_SLUG` THEN o sistema SHALL responder 422 antes de processar qualquer linha
7. The sistema SHALL aplicar a cada item as mesmas regras de linha já especificadas em `importador-oficinas`: deduplicação por CNPJ, geocodificação obrigatória, vínculo idempotente ao cliente e tentativa de atribuição de rota
8. The sistema SHALL NOT validar nomes, ordem ou quantidade de colunas em nenhum ponto deste endpoint
9. IF uma linha falha (CNPJ inválido, CNPJ duplicado no lote, CEP inválido, geocodificação malsucedida ou erro inesperado) THEN o sistema SHALL registrar o motivo para aquela linha e SHALL continuar processando as demais
10. WHILE o lote é processado, o sistema SHALL manter o mesmo teto de concorrência por linha já usado hoje (8 linhas simultâneas)

**Independent Test**: enviar um corpo com colunas em qualquer ordem e com nomes arbitrários (já
mapeados para as chaves do contrato) e verificar que a importação roda; enviar um corpo sem `CEP`
em um item e verificar 400 sem nenhuma escrita.

---

### P1: Relatório em stream com barra de progresso ⭐ MVP

**User Story**: Como cliente, quero ver uma barra andando enquanto as oficinas são importadas,
mostrando quantas já eram cadastradas na Oficina Brasil e quantas são novas, para saber que o
processo está vivo e o que ele está produzindo.

**Why P1**: Pedido explícito, e sem ele uma importação longa parece travada.

**Acceptance Criteria**:

1. WHEN o processamento do lote começa THEN o sistema SHALL emitir um evento `inicio` contendo o total de linhas a processar
2. WHILE o lote é processado, o sistema SHALL emitir eventos `progresso` contendo linhas processadas, `oficinas_criadas`, `oficinas_vinculadas_existentes`, `ja_na_comunidade` e quantidade de erros acumulados
3. The sistema SHALL emitir no máximo um evento `progresso` a cada 500ms
4. WHILE eventos `progresso` são emitidos, cada contador SHALL ser maior ou igual ao valor do evento anterior
5. WHEN o processamento termina THEN o sistema SHALL emitir um evento `fim` contendo o `ImportResult` completo, incluindo a lista `erros`
6. IF o processamento do lote falha por erro não tratado depois do início do stream THEN o sistema SHALL emitir um evento `erro` com a mensagem e SHALL encerrar o stream
7. WHEN o modal recebe um evento `progresso` THEN o sistema SHALL atualizar uma barra horizontal cuja largura é a razão entre linhas processadas e total
8. WHILE o stream está aberto, o modal SHALL exibir, lado a lado, a contagem de oficinas novas no sistema e a de oficinas já cadastradas na Oficina Brasil
9. WHILE o stream está aberto, o sistema SHALL manter desabilitados o fechamento do modal e o botão de importar
10. WHEN o evento `fim` chega THEN o sistema SHALL exibir o resultado consolidado com a mesma quebra de motivos de erro já usada hoje em `ImportOficinasResultModal`
11. IF a conexão do stream cai antes do evento `fim` THEN o sistema SHALL exibir que a importação foi interrompida e SHALL informar que reimportar o mesmo arquivo é seguro

**Independent Test**: importar uma planilha com uma oficina já cadastrada e duas inéditas; observar a
barra avançando, os dois contadores subindo separadamente e o resultado final coincidindo com a soma
dos eventos de progresso.

---

## Edge Cases

- IF o array `oficinas` chega vazio THEN o sistema SHALL responder 400 sem abrir o stream
- IF todas as linhas do lote falham THEN o sistema SHALL emitir o evento `fim` normalmente, com todos os contadores em zero e `erros` preenchido
- IF o mesmo CNPJ aparece duas vezes no array THEN a segunda ocorrência SHALL ser reportada como `CNPJ_DUPLICADO_NO_ARQUIVO`, como já ocorre hoje
- IF o usuário mapeia a mesma coluna para dois campos THEN o sistema SHALL impedir a seleção, desabilitando a coluna já usada
- IF a planilha tem mais de 5.000 linhas de dados THEN o modal SHALL informar o teto antes de enviar
- WHEN uma célula numérica de CNPJ vem formatada como número pela planilha THEN o sistema SHALL usar o texto exibido da célula, não o valor bruto
- IF o arquivo `.csv` não tem BOM e está em UTF-8 THEN o sistema SHALL decodificá-lo como UTF-8 antes de ler o cabeçalho

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
|---|---|---|---|
| UI-01 | P1: Modal único com de-para | Design | Pending |
| UI-02 | P1: Modal único com de-para | Design | Pending |
| UI-03 | P1: Modal único com de-para | Design | Pending |
| UI-04 | P1: Modal único com de-para | Design | Pending |
| UI-05 | P1: Modal único com de-para | Design | Pending |
| UI-06 | P1: Modal único com de-para | Design | Pending |
| UI-07 | P1: Modal único com de-para | Design | Pending |
| UI-08 | P1: Modal único com de-para | Design | Pending |
| UI-09 | P1: Modal único com de-para | Design | Pending |
| UI-10 | P1: Modal único com de-para | Design | Pending |
| UI-11 | P1: Modal único com de-para | Design | Pending |
| UI-12 | P1: Modal único com de-para | Design | Pending |
| UI-13 | P1: Modal único com de-para | Design | Pending |
| API-01 | P1: Endpoint por linhas mapeadas | Design | Pending |
| API-02 | P1: Endpoint por linhas mapeadas | Design | Pending |
| API-03 | P1: Endpoint por linhas mapeadas | Design | Pending |
| API-04 | P1: Endpoint por linhas mapeadas | Design | Pending |
| API-05 | P1: Endpoint por linhas mapeadas | Design | Pending |
| API-06 | P1: Endpoint por linhas mapeadas | Design | Pending |
| API-07 | P1: Endpoint por linhas mapeadas | Design | Pending |
| API-08 | P1: Endpoint por linhas mapeadas | Design | Pending |
| API-09 | P1: Endpoint por linhas mapeadas | Design | Pending |
| API-10 | P1: Endpoint por linhas mapeadas | Design | Pending |
| STREAM-01 | P1: Relatório em stream | Design | Pending |
| STREAM-02 | P1: Relatório em stream | Design | Pending |
| STREAM-03 | P1: Relatório em stream | Design | Pending |
| STREAM-04 | P1: Relatório em stream | Design | Pending |
| STREAM-05 | P1: Relatório em stream | Design | Pending |
| STREAM-06 | P1: Relatório em stream | Design | Pending |
| STREAM-07 | P1: Relatório em stream | Design | Pending |
| STREAM-08 | P1: Relatório em stream | Design | Pending |
| STREAM-09 | P1: Relatório em stream | Design | Pending |
| STREAM-10 | P1: Relatório em stream | Design | Pending |
| STREAM-11 | P1: Relatório em stream | Design | Pending |

**ID format:** `UI-NN`, `API-NN`, `STREAM-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 34 total, 34 mapped to design, 0 unmapped

---

## Success Criteria

- [ ] Uma planilha com colunas em ordem diferente e nomes diferentes é importada sem edição manual do arquivo
- [ ] O passo 3 do wizard tem um botão de importação, e nenhum botão de modelo
- [ ] Durante a importação a barra avança e os dois contadores sobem separadamente
- [ ] O total do evento `fim` coincide com a soma de criadas, vinculadas existentes e erros
- [ ] Reimportar o mesmo arquivo após uma queda de conexão não duplica oficina nem vínculo
