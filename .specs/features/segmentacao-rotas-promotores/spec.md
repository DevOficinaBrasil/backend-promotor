# Segmentação de oficinas nas rotas de promotores

**Jira:** épica CON26-95
**Status:** Especificado — bloqueado pelo discovery (CON26-96)
**Sprint:** INT - Sprint 2 (2026-08-10)

## Problema

A rota do promotor recorta as oficinas **só por raio geográfico**. Não há como restringir por
critério de negócio, e não há como saber o tamanho da rota antes de criá-la.

A equipe de engajamento já resolveu segmentação para as ações deles. A premissa desta feature é
**replicar o modelo que já existe lá**, não inventar um novo — dois vocabulários de segmentação na
mesma comunidade produzem duas definições de "oficina elegível".

## Requisitos

| ID | Requisito | Jira |
|----|-----------|------|
| R1 | Levantar o modelo de segmentação usado hoje pela equipe de engajamento, incluindo se há API reaproveitável | CON26-96 |
| R2 | O filtro é persistido por rota (vínculo promotor↔campanha) e editável pelo usuário a qualquer momento | CON26-97 |
| R3 | Filtro inválido é rejeitado na entrada, identificando o critério ofensor | CON26-97 |
| R4 | Filtro vazio equivale ao comportamento atual — todas as oficinas do raio | CON26-97 |
| R5 | Uma única tradução filtro→predicado serve contagem e atribuição | CON26-97 |
| R6 | Endpoint devolve quantas oficinas da comunidade o filtro atinge, para filtro **ainda não salvo** | CON26-98 |
| R7 | A contagem devolve também o total do raio sem filtro, como denominador | CON26-98 |
| R8 | Reparador novo na comunidade, dentro do raio de rota ativa, é atribuído automaticamente | CON26-99 |
| R9 | Falha na atribuição automática não impede o cadastro do reparador | CON26-99 |
| R10 | Interface do construtor de filtro com contagem de impacto sempre visível | CON26-103 |

## Gray areas — resolver no discovery (R1)

Estas três respostas mudam a modelagem e estão explicitamente em aberto:

1. **Combinação de critérios.** Lista plana com `E` → jsonb simples. `OU`, negação ou grupos
   aninhados → estrutura de árvore, e a tela do CON26-103 muda junto.
2. **Existe API de segmentação do lado de engajamento?** Se existir, consumir pode ser melhor que
   reimplementar — decisão a registrar em CON26-96.
3. **Volume de oficinas.** Define se a contagem ao vivo (R6) precisa de índice novo ou de debounce
   na tela.

## Decisões já tomadas

- **jsonb, não tabela normalizada.** O filtro é lido e escrito inteiro, nunca consultado por
  critério isolado. Normalizar só adiciona join.
- **Sem FK nova.** Padrão da casa é relacionamento implícito — ver decisão de 2026-08-07 no
  [STATE.md](../../project/STATE.md) sobre a FK removida da `NOTIFICACAO_VISITA`.
- **A auto-atribuição por reparador novo (R8) fica sob a épica CON26-66**, não aqui: ela estende o
  serviço criado em CON26-71 em vez de introduzir regra de proximidade nova.

## Riscos

- **Divergência contagem × atribuição.** Se as duas usarem predicados diferentes, o número na tela
  vira mentira e ninguém percebe até conferir na mão. Mitigação: R5 + teste comparando os totais.
- **Injeção.** Os valores do filtro vêm do usuário e entram numa consulta. Parametrizar sempre.
  Lembrar que a API não tem autenticação montada — ver `CONCERNS.md`.
- **R8 sobre caminhos de cadastro não mapeados.** Se existir caminho de entrada de reparador fora do
  cadastro direto (importação, obads), o gatilho precisa pegar todos.

## Fora de escopo

- Segmentação em qualquer contexto que não seja rota de promotor
- Reavaliação retroativa das rotas já montadas quando um filtro muda
- Cache ou materialização da contagem
