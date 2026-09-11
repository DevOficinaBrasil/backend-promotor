# Contexto — decisões do usuário (Discuss)

Decisões tomadas pelo usuário em 2026-09-11, antes da spec. São vinculantes: a
spec e o design não podem contrariá-las sem uma nova conversa.

## D1 — Onde a planilha é transformada

**Decisão:** no browser. O SheetJS lê o cabeçalho, o usuário faz o de-para, e o
front envia um array JSON de oficinas já mapeadas.

**Consequência direta:** revoga `IMPORT-01` e `IMPORT-03` da spec
`importador-oficinas` (cabeçalho fixo de 8 colunas, mesma ordem, arquivo
rejeitado inteiro se divergir). O endpoint `POST /oficina/import`
(multipart + validação de cabeçalho) deixa de ser o caminho do produto.

**Alternativa descartada:** enviar o arquivo mais o mapa de índices de coluna e
aplicar o mapeamento no servidor. Manteria o teto de 5MB do multer e o parsing
num lugar só, mas fugiria do padrão do módulo de automação, que foi o pedido
explícito do usuário.

## D2 — Botão único

**Decisão:** existe apenas o botão "Importar oficinas" no passo 3 do wizard. Ele
abre um modal que explica o processo e conduz anexo → de-para → revisão →
importação.

## D3 — "Baixar modelo" sai de vez

**Decisão:** remover o botão e também o gerador de modelo
(`oficinaImportTemplate.ts`) e seu teste. Com de-para qualquer planilha serve, e
um modelo na tela sugeriria de novo um formato obrigatório.

**Alternativa descartada:** mover o link para dentro do modal.

## D4 — Progresso em stream

**Decisão:** a request de importação responde em stream e o modal mostra uma
barra horizontal com quantas oficinas já eram cadastradas na Oficina Brasil e
quantas são novas no sistema.
