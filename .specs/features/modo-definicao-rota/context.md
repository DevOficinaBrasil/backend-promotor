# Contexto — decisões do usuário (Discuss)

Decisões tomadas pelo usuário em 2026-09-11, antes da spec. São vinculantes.

## D1 — Persistência do dia planejado

**Decisão:** coluna nova, anulável, em `CAMPANHAS_OB.ROTA_PROMOTOR`, mais migration SQL manual
(o repositório não tem runner de migration). `ORDEM` passa a significar a ordem **dentro do dia**.

**Alternativa descartada:** tabela dedicada de agenda ligando rota, data e ordem. Isolaria melhor,
mas obrigaria um join novo em toda leitura de rota — inclusive em `GET /campanha/ativa`, que é o
caminho quente do app de campo.

## D2 — Rotas sem dia agendado

**Decisão:** continuam aparecendo para o promotor como hoje. A agenda por dia é um recorte
opcional por cima do que já existe, não um pré-requisito.

**Consequência:** nenhuma campanha já publicada muda de comportamento enquanto o supervisor não
abrir o modo definição de rota. É o que torna a entrega deployável sem migração de dados.

**Alternativa descartada:** esconder do promotor tudo que não foi agendado.

## D3 — Relação com a ordenação existente

**Decisão:** o modo definição de rota **substitui** o botão "Ordenar rotas" do card de promotor.
Ordenação manual, cálculo otimizado com ponto inicial e final, e agenda por dia passam a viver
todos dentro do novo modo.

**Alternativa descartada:** manter as duas telas de ordenação coexistindo.

## D4 — Escopo da otimização

**Decisão:** o cálculo de rota otimizada roda sobre as oficinas **de um dia**. Cada dia tem seu
próprio ponto inicial, ponto final e ordem.

**Alternativa descartada:** otimizar o vínculo inteiro e fatiar em dias; e oferecer os dois botões.

## D5 — Intervalo do calendário

**Decisão:** limitado ao período da campanha (`START_TIME` a `END_TIME`), incluindo sábados e
domingos.

**Alternativa descartada:** só dias úteis; e datas livres sem trava.

## D6 — Notificação de visita

**Decisão:** fora de escopo. Agendar o dia de uma visita não muda nada no fluxo de
`NOTIFICACAO_VISITA`.
