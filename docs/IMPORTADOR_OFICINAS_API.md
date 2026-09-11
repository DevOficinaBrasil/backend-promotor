# Importador de Oficinas — Contrato da API (para o frontend)

Referência de integração do botão **"Importar oficinas"** do step 3 do wizard de campanha-promotores (repositório `ob-ads`).

Existem **dois** endpoints de importação. O primeiro é o atual; o multipart segue de pé apenas por compatibilidade.

| Endpoint | Estado | Quem usa |
|---|---|---|
| `POST /oficina/import-stream` | **Atual** | O modal de importação com "de-para" de colunas |
| `POST /oficina/import` | **Depreciado** | O dashboard já publicado, até o deploy do front novo |

---

## `POST /oficina/import-stream` (atual)

```
POST /oficina/import-stream
Content-Type: application/json
```

O "de-para" acontece no browser: o front lê o cabeçalho real da planilha, o usuário aponta qual coluna é qual, e o que chega aqui já são linhas mapeadas por nome de campo. **Nenhum nome nem ordem de coluna é validado no servidor.**

### Requisição

```json
{
  "ID_CAMPANHA": 42,
  "oficinas": [
    {
      "linha": 2,
      "cnpj": "12.345.678/0001-99",
      "cep": "01310-100",
      "nomeOficina": "Oficina Exemplo",
      "endereco": "Av. Paulista",
      "numero": "1000",
      "bairro": "Bela Vista",
      "estado": "SP",
      "cidade": "São Paulo"
    }
  ]
}
```

| Campo | Obrigatório | Observação |
|---|---|---|
| `ID_CAMPANHA` | sim | O `EMPRESA_SLUG` é resolvido no servidor a partir dela. Não existe campo para enviar o slug |
| `oficinas` | sim | De 1 a 5.000 itens |
| `oficinas[].cnpj` | sim | Chave de deduplicação contra `MAIN_REGISTER.OFICINA` |
| `oficinas[].cep` | sim | Única entrada da geocodificação |
| `oficinas[].linha` | não | Número da linha na planilha de origem, usado só para reportar erro. Ausente, o servidor usa a posição no array |
| demais campos | não | Só são usados quando a oficina é inédita e precisa ser criada |

Teto de corpo: **8MB**. Corpo maior recebe 413.

### Resposta: NDJSON

`Content-Type: application/x-ndjson`. Uma linha JSON por evento, na ordem `inicio`, depois `progresso` repetido, depois `fim`.

```
{"tipo":"inicio","total":120}
{"tipo":"progresso","progresso":{"processadas":37,"total":120,"oficinas_criadas":21,"oficinas_vinculadas_existentes":14,"ja_na_comunidade":2,"erros":0}}
{"tipo":"fim","resultado":{ ... mesmo objeto do endpoint antigo ... }}
```

| Evento | Quando | Conteúdo |
|---|---|---|
| `inicio` | Antes da primeira linha | `total` de linhas do lote |
| `progresso` | Durante o processamento | Contadores acumulados. Sai no máximo a cada 500ms, e o último sempre sai, para a barra fechar em 100% |
| `fim` | No encerramento normal | O relatório completo, incluindo `erros` |
| `erro` | Falha depois do primeiro byte | `mensagem`. O status já é 200 nesse ponto e não há como voltar atrás |

**Como consumir:** `axios` no browser usa XHR, que não entrega o corpo incrementalmente — use `fetch` com `response.body.getReader()` e acumule até o `\n`.

### Erros de pré-voo

Saem como JSON comum, antes de qualquer cabeçalho de stream.

| Status | Quando |
|---|---|
| 400 | Corpo fora do schema: sem `ID_CAMPANHA`, `oficinas` vazio, linha sem `cnpj` ou sem `cep`, ou mais de 5.000 linhas |
| 404 | Campanha inexistente ou apagada |
| 413 | Corpo acima de 8MB |
| 422 | Campanha sem `EMPRESA_SLUG` |

### Se a conexão cair no meio

As linhas já processadas **permanecem gravadas** — não há rollback do lote. Reimportar o mesmo arquivo é seguro: a deduplicação por CNPJ e o vínculo idempotente fazem a segunda passada convergir, contando as oficinas já processadas como "já na comunidade".

Cada linha do lote roda as mesmas regras do endpoint antigo: deduplicação por CNPJ, geocodificação obrigatória, vínculo idempotente ao cliente e tentativa de atribuição de rota. Um erro de linha nunca aborta o lote.

---

## `POST /oficina/import` (depreciado)

> **Depreciado.** Continua de pé sem nenhuma mudança de comportamento porque o dashboard publicado ainda o chama, e derrubá-lo quebraria produção no intervalo entre o deploy do backend e o do front. Nenhum código novo deve chamá-lo. A remoção é uma limpeza separada.

## Endpoint

```
POST /oficina/import
Content-Type: multipart/form-data
```

Não há prefixo `/api` — a rota é montada direto em `/oficina` (`api.ts`). Autenticação: nenhuma é exigida hoje por este endpoint (mesmo estado dos demais endpoints de `/oficina`); a documentação OpenAPI já anuncia `bearerAuth`, mas não é validado no momento — enviar o token do usuário logado de qualquer forma, para já estar pronto quando a autenticação for ligada.

## Requisição

Campos do `multipart/form-data`:

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `file` | arquivo | sim | Planilha `.xlsx` ou `.csv`, até 5MB |
| `ID_CAMPANHA` | texto (número) | sim | ID da campanha já salva. O `EMPRESA_SLUG` do cliente é resolvido no servidor a partir dela — **não existe campo para enviar o slug diretamente** |

**Pré-condição**: a campanha precisa já existir no backend (ter sido salva) antes de habilitar o botão — o import não funciona sobre um rascunho de wizard ainda não persistido.

### Padrão de colunas da planilha (obrigatório)

A primeira linha da planilha deve conter **exatamente** estas 8 colunas, **nessa ordem**:

```
NOME OFICINA | CNPJ | CEP | ENDEREÇO | NUMERO | BAIRRO | ESTADO | CIDADE
```

- Comparação tolera variação de **maiúsculas/minúsculas e acentuação** (ex: `endereco`, `Endereço`, `ENDEREÇO` são todos aceitos).
- **Não tolera** colunas fora de ordem, faltando, ou colunas extras — o arquivo inteiro é rejeitado (400) sem processar nenhuma linha.
- Este cabeçalho fixo vale **somente** para o endpoint depreciado. O endpoint atual aceita qualquer cabeçalho, porque o mapeamento é feito no browser.

### Exemplo de requisição (fetch)

```javascript
const formData = new FormData();
formData.append("file", arquivoSelecionado); // File do <input type="file">
formData.append("ID_CAMPANHA", String(idCampanha));

const response = await fetch(`${API_BASE_URL}/oficina/import`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: formData, // NÃO definir Content-Type manualmente — o browser gera o boundary do multipart
});

const resultado = await response.json();
```

### Exemplo (curl)

```bash
curl -X POST "$API_BASE_URL/oficina/import" \
  -H "Authorization: Bearer $TOKEN" \
  -F "ID_CAMPANHA=10" \
  -F "file=@oficinas.xlsx"
```

## Resposta de sucesso — 200

Sempre que o arquivo é estruturalmente válido (cabeçalho correto, dentro dos limites de tamanho/linhas, campanha resolvida), o backend responde **200** — mesmo que algumas linhas tenham sido rejeitadas individualmente. Erros de linha nunca abortam o arquivo inteiro; vêm relacionados em `data.erros`.

```json
{
  "message": "Importação processada.",
  "data": {
    "total_linhas": 50,
    "oficinas_criadas": 30,
    "oficinas_vinculadas_existentes": 15,
    "ja_na_comunidade": 12,
    "rotas_criadas": 28,
    "rotas_sem_promotor_disponivel": 2,
    "campanhas_ativas_consideradas": 1,
    "erros": [
      { "linha": 7, "cnpj": "123", "motivo": "CNPJ_INVALIDO" },
      { "linha": 23, "cnpj": "12345678000190", "motivo": "CNPJ_DUPLICADO_NO_ARQUIVO" }
    ]
  }
}
```

### Campos de `data`

| Campo | Significado |
|---|---|
| `total_linhas` | Total de linhas de dados no arquivo (exclui o cabeçalho) |
| `oficinas_criadas` | Linhas cujo CNPJ não existia na base — uma oficina nova foi cadastrada |
| `oficinas_vinculadas_existentes` | Linhas cujo CNPJ já existia — a oficina existente foi reaproveitada (nenhum dado sobrescrito) |
| `ja_na_comunidade` | Dentre as processadas com sucesso, quantas a oficina já pertencia à comunidade do cliente (não foi necessário criar vínculo novo) |
| `rotas_criadas` | Quantas oficinas foram atribuídas a um promotor (nova `ROTA_PROMOTOR`) — considera todas as campanhas ativas do cliente, não só a `ID_CAMPANHA` enviada |
| `rotas_sem_promotor_disponivel` | Oficinas importadas com sucesso para as quais pelo menos uma campanha ativa foi considerada, mas nenhum promotor tinha a oficina dentro do raio configurado |
| `campanhas_ativas_consideradas` | Quantas campanhas do cliente (`EMPRESA_SLUG`) estavam ativas (`START_TIME`/`END_TIME` cobrindo agora) no momento da importação. Diagnóstico direto: se vier `0`, **nenhuma** campanha do cliente está ativa agora — nenhuma rota pode ser criada, independente de raio/promotor, e isso não é reportado como erro |
| `erros` | Uma entrada por linha rejeitada — ver tabela de `motivo` abaixo |

**Importante para a UI**: `oficinas_criadas + oficinas_vinculadas_existentes + erros.length === total_linhas` sempre — toda linha cai em exatamente uma dessas categorias (sucesso ou erro), nunca as duas.

**Diagnóstico de `rotas_criadas: 0`** (nenhum erro, mas nenhuma rota atribuída) — os dois novos campos acima dizem exatamente por quê, sem precisar adivinhar:

| Cenário | `campanhas_ativas_consideradas` | `rotas_sem_promotor_disponivel` | O que mostrar na UI |
|---|---|---|---|
| Nenhuma campanha do cliente está ativa agora | `0` | `0` | "Nenhuma campanha ativa no momento — as oficinas foram importadas, mas a atribuição de rota só acontece quando uma campanha estiver em andamento." |
| Havia campanha(s) ativa(s), mas nenhum promotor cobre essas oficinas | `> 0` | `> 0` (igual ou próximo do total de sucessos) | "Oficinas importadas, mas nenhuma tinha um promotor no raio de cobertura — atribuição manual pode ser necessária." |
| Tudo certo | `> 0` | `0` (com `rotas_criadas > 0`) | Sem aviso — fluxo normal |

### Tabela de `motivo` (erros de linha)

| `motivo` | Causa | Ação sugerida na UI |
|---|---|---|
| `CNPJ_INVALIDO` | O valor da coluna CNPJ não normaliza para 14 dígitos | Pedir para o usuário corrigir o CNPJ dessa linha e reimportar só ela (ou o arquivo todo) |
| `CNPJ_DUPLICADO_NO_ARQUIVO` | Esse CNPJ já apareceu numa linha anterior do mesmo arquivo (só a primeira ocorrência é processada) | Avisar que a planilha tem CNPJ repetido |
| `CEP_INVALIDO` | Célula de CEP vazia ou sem nenhum dígito | Pedir para preencher o CEP dessa linha |
| `GEOCODIFICACAO_FALHOU` | O CEP não pôde ser geocodificado por nenhum provedor (CEP pode estar correto mas ser muito recente/raro) | Sugerir revisar o CEP; pode ser corrigido manualmente depois no cadastro da oficina |
| `ERRO_PROCESSAMENTO` | Falha inesperada ao processar a linha (ex: instabilidade de banco) | Sugerir reimportar só essa linha depois; não é erro do usuário |

**Reimportação é idempotente**: reenviar a mesma planilha para a mesma campanha/cliente não duplica oficinas nem vínculos — linhas já processadas aparecem novamente como sucesso (`oficinas_vinculadas_existentes` + `ja_na_comunidade`), não como erro.

## Respostas de erro (arquivo inteiro rejeitado)

Nenhuma linha é processada nestes casos — nenhuma oficina é criada ou vinculada.

| Status | Quando | Corpo |
|---|---|---|
| 400 | Extensão de arquivo diferente de `.xlsx`/`.csv`, ou arquivo acima de 5MB | `{ "message": "..." }` (mensagem do multer, ex: `"Arquivo deve ser .xlsx ou .csv"`) |
| 400 | `ID_CAMPANHA` ausente ou não é um número positivo | `{ "message": "ID_CAMPANHA inválido.", "details": [...] }` |
| 400 | Nenhum arquivo enviado no campo `file` | `{ "message": "Arquivo não enviado." }` |
| 400 | Cabeçalho da planilha fora do padrão (nome/ordem/quantidade de colunas) | `{ "message": "Estrutura de colunas inválida. Esperado exatamente: NOME OFICINA; CNPJ; CEP; ENDEREÇO; NUMERO; BAIRRO; ESTADO; CIDADE." }` |
| 400 | Mais de 5.000 linhas de dados | `{ "message": "Arquivo excede o limite de 5.000 linhas." }` |
| 404 | `ID_CAMPANHA` não existe (ou foi excluída) | `{ "message": "Campanha não encontrada." }` |
| 422 | Campanha existe mas não tem `EMPRESA_SLUG` configurado (não está vinculada a nenhum cliente) | `{ "message": "Campanha sem empresa vinculada." }` |
| 500 | Erro interno inesperado | `{ "message": "Erro interno ao importar oficinas.", "error": "..." }` |

Todas essas respostas têm o mesmo formato — checar `response.status` primeiro; só ler `data` quando `status === 200`.

## Sugestão de fluxo na UI (step 3 do wizard)

1. Botão **"Importar oficinas"** abre um seletor de arquivo (aceitar `.xlsx,.csv` no `accept` do input).
2. Ao selecionar, enviar imediatamente (não há preview client-side do conteúdo — a validação de cabeçalho só acontece no servidor).
3. Enquanto a requisição está em voo, mostrar loading — pode levar alguns segundos para arquivos grandes (geocodificação é feita linha a linha, uma chamada HTTP externa por oficina sem lat/long).
4. Em caso de **erro de arquivo inteiro** (400/404/422/500): mostrar a `message` diretamente, sem tentar interpretar.
5. Em caso de **200**: mostrar um resumo (ex: "42 oficinas importadas, 3 já existiam, 5 linhas com erro") e, se `erros.length > 0`, uma lista expansível com `linha` + `cnpj` + o texto amigável do `motivo` (usar a tabela acima para traduzir o código).
6. Atualizar o mapa/lista de oficinas da campanha após o import (as oficinas aparecem via os mesmos endpoints já usados hoje, ex: `GET /oficina/community-nearby`, `POST /oficina/community-all` — nenhum endpoint novo de leitura foi criado, o import só alimenta os que já existem).

## Referências

- Endpoint: `routes/OficinaRoute.ts`, `controllers/oficinaController.ts` (`importOficinas`)
- Lógica de negócio: `service/oficinaImportService.ts`
- Spec/design completos: `.specs/features/importador-oficinas/spec.md`, `.specs/features/importador-oficinas/design.md`
