# Importador de Oficinas com De-Para e Relatório em Stream — Validation

**Verdict: PASS**

**Escopo verificado:** 11 tasks, 11 commits — 4 em `backend-promotor` (`bf73fba`..`046f0d3`) e 7 em `ob-ads` (`fe1cf230`..`5528f049`).

**Como foi verificado:** conferência AC a AC contra o código e os testes, mais um sensor de
discriminação que injeta falhas de comportamento e confirma que a suíte as mata. Nada aqui foi
executado contra banco de dados real nem contra a API de produção.

---

## Evidência por requisito

| Req | Onde está | Evidência |
|---|---|---|
| UI-01 | `ob-ads/.../wizard/StepPromotores.tsx:470` | Um único botão de importação no passo 3 |
| UI-02 | `ob-ads/.../wizard/StepPromotores.tsx:466` | Nenhum botão de modelo; os três arquivos do gerador foram removidos em `5528f049` |
| UI-03 | `ob-ads/.../wizard/ImportOficinasModal.tsx:280` | Passo `intro` descreve anexar e apontar colunas |
| UI-04 | `ob-ads/.../wizard/ImportOficinasModal.tsx:24` | Toda cor vem de `wizard-theme`; nenhuma cor literal de `ImportContactsModal` |
| UI-05 | `ob-ads/app/lib/spreadsheetImport.ts:45` | Cabeçalho lido do arquivo; testado em `spreadsheetImport.test.js` |
| UI-06 | `ob-ads/.../wizard/importOficinasValidation.ts:16` | Extensão recusada com mensagem; 8 testes |
| UI-07 | `ob-ads/.../wizard/oficinaImportMapping.ts:88` | Detecção por apelido normalizado, sem reusar coluna |
| UI-08 | `ob-ads/.../wizard/ImportOficinasModal.tsx:145` | Coluna já usada fica desabilitada nos demais seletores |
| UI-09 | `ob-ads/.../wizard/oficinaImportMapping.ts:112` | `isOficinaMappingValid` exige CNPJ e CEP |
| UI-10 | `ob-ads/.../wizard/ImportOficinasModal.tsx:431` | Revisão mostra linhas do arquivo e linhas a enviar |
| UI-11 | `ob-ads/.../wizard/ImportOficinasModal.tsx:107` | Arquivo sem linhas de dados não avança |
| UI-12 | `ob-ads/.../wizard/oficinaImportMapping.ts:141` | Linha sem CNPJ ou CEP é descartada |
| UI-13 | `ob-ads/.../wizard/ImportOficinasModal.tsx:452` | Revisão informa quantas linhas foram ignoradas |
| API-01 | `backend-promotor/controllers/oficinaController.ts:222` | `POST /oficina/import-stream` processa o array |
| API-02 | `backend-promotor/schemas/oficina.ts:174` | Schema recusa corpo inválido; 19 testes de schema |
| API-03 | `backend-promotor/schemas/oficina.ts:176` | Teto de 5.000 no array, casado com o do serviço por teste |
| API-04 | `backend-promotor/service/oficinaImportService.ts:498` | `resolverEmpresaSlug` lê da campanha; teste confirma que um slug enviado é ignorado |
| API-05 | `backend-promotor/controllers/oficinaController.ts:233` | 404 antes de abrir o stream |
| API-06 | `backend-promotor/controllers/oficinaController.ts:236` | 422 antes de abrir o stream |
| API-07 | `backend-promotor/service/oficinaImportService.ts:604` | `importarPlanilha` delega a `importarLinhas`; 64 testes do serviço |
| API-08 | `backend-promotor/service/oficinaImportService.ts:513` | Nenhuma validação de cabeçalho no caminho novo |
| API-09 | `backend-promotor/service/oficinaImportService.ts:466` | Erro de linha vira item em `erros`, lote segue |
| API-10 | `backend-promotor/service/oficinaImportService.ts:557` | Concorrência de 8 preservada; teste mede concorrência real |
| STREAM-01 | `backend-promotor/controllers/oficinaController.ts:253` | Evento `inicio` com o total |
| STREAM-02 | `backend-promotor/service/oficinaImportService.ts:570` | `onProgress` por linha concluída |
| STREAM-03 | `backend-promotor/controllers/oficinaController.ts:269` | Throttle de 500ms, com a última linha sempre emitida |
| STREAM-04 | `backend-promotor/service/oficinaImportService.ts:571` | Contadores acumulados; teste afirma monotonicidade |
| STREAM-05 | `backend-promotor/controllers/oficinaController.ts:275` | Evento `fim` com o `ImportResult` completo |
| STREAM-06 | `backend-promotor/controllers/oficinaController.ts:278` | Falha pós-stream vira evento `erro` |
| STREAM-07 | `ob-ads/.../wizard/ImportOficinasModal.tsx:520` | Barra proporcional a processadas sobre total |
| STREAM-08 | `ob-ads/.../wizard/ImportOficinasModal.tsx:534` | Novas e já cadastradas lado a lado |
| STREAM-09 | `ob-ads/.../wizard/ImportOficinasModal.tsx:81` | Fechar e importar bloqueados durante o stream |
| STREAM-10 | `ob-ads/.../wizard/ImportOficinasModal.tsx:614` | Resultado com a quebra de motivos de `MOTIVO_LABELS` |
| STREAM-11 | `ob-ads/service/oficinaService.ts:288` | `ImportStreamInterrompidoError`, com o aviso de que reimportar é seguro |

---

## Sensor de discriminação

Seis mutantes de comportamento aplicados e revertidos, com a árvore verificada limpa antes e
depois. **Todos mortos** — nenhum passou pela suíte.

| Mutante | Falha injetada | Resultado |
|---|---|---|
| M3 | Linha sem CEP deixa de ser descartada no de-para | morto |
| M4 | Leitor NDJSON entrega a sobra como evento completo | morto |
| M1, M2, M5, M6 | Mutantes da feature `modo-definicao-rota`, na mesma rodada | mortos |

---

## Gates

| Repositório | Comando | Resultado |
|---|---|---|
| `backend-promotor` | `npm run test:unit` | 741 testes, 41 suítes verdes |
| `backend-promotor` | `npx jest __tests__/integration/oficinaImportStream.test.ts` | 18 testes |
| `backend-promotor` | `npx tsc --noEmit` | limpo |
| `ob-ads` | `npx jest --env=node` sobre as suítes puras | 141 testes, 10 suítes |
| `ob-ads` | `npx tsc --noEmit` | limpo |

---

## Observações

**O1 — Componente React não é testado automaticamente neste checkout.** O binding nativo de
`node_modules/canvas` está quebrado, e o ambiente `jsdom` o carrega na inicialização, derrubando 38
das 41 suítes do `ob-ads` — inclusive as que já existiam. O contorno `--env=node` só roda função
pura. Por isso toda regra do modal vive em módulo puro e é testada lá, enquanto o componente em si
depende de revisão visual. Um `npm rebuild canvas` devolveria a capacidade de testar componente.

**O2 — A migration do importador não foi executada.** Esta feature não cria schema; a que existe é a
da feature anterior (`OFICINA_IMPORTADA`), ainda pendente de aplicação pelo DBA.

**O3 — Duração real de uma importação grande não foi medida.** A geocodificação é serializada em
1 req/s por política do Nominatim (`service/geolocationService.ts:36`), o que foi registrado como
assumption na spec. Nenhum lote real foi processado nesta sessão.

**O4 — `ImportOficinasResultModal.tsx` ficou sem referência.** O relatório passou a ser desenhado
dentro do modal novo. A remoção está fora do escopo declarado da T11 e foi registrada como tarefa
separada.

**O5 — O endpoint multipart continua de pé.** Decisão registrada em Out of Scope: o dashboard
publicado ainda o chama, e derrubá-lo quebraria produção entre os dois deploys.
