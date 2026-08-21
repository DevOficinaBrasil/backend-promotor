# Auto-Atribuição de Rotas ao Cadastrar Promotor

## Problem Statement

Atualmente, ao cadastrar um promotor, as rotas são atribuídas manualmente. Precisamos de um mecanismo automático que, ao cadastrar o promotor (com CEP salvo + lat/long calculados), busque as oficinas da comunidade do cliente dentro do raio definido e crie automaticamente as rotas (ROTA_PROMOTOR) vinculadas ao CAMPANHA_PROMOTOR.

## Goals

- [ ] Implementar `getComunityNearbyOficinas` na `oficinaService` que busca oficinas de usuários inscritos na comunidade do cliente, filtradas por raio (Haversine)
- [ ] Após cadastro do promotor + link com campanha, auto-atribuir rotas com base nas oficinas encontradas
- [ ] Criar endpoint de debug para validar a busca de oficinas por comunidade
- [ ] O raio de atribuição (default 20km) é lido de `CAMPANHA_PROMOTOR.RAIO` e deve ser alterável

## Contexto Técnico

### Entidades Envolvidas

| Entidade | Schema/Tabela | Papel |
|----------|---------------|-------|
| Promotor | `CAMPANHAS_OB.PROMOTOR` | CEP, LATITUDE, LONGITUDE do promotor |
| CampanhaPromotor | `CAMPANHAS_OB.CAMPANHA_PROMOTOR` | Vínculo promotor↔campanha com RAIO |
| RotaPromotor | `CAMPANHAS_OB.ROTA_PROMOTOR` | Rotas criadas automaticamente |
| CadastroEmpresa | `dw.cadastro_empresa` | Dados confiáveis das oficinas (lat, long, endereço) |
| Communities | `OFICINA_PORTAL.COMMUNITIES` | Comunidades dos clientes |
| UsuarioCommunity | `MAIN_REGISTER.USUARIO_COMMUNITY` | Vínculo usuário↔comunidade |
| Usuario | `MAIN_REGISTER.USUARIO` | Vínculo usuário↔oficina (ID_OFICINA) |

### Fluxo de Dados

```
Promotor cadastrado (CEP → lat/long via geolocation)
  → linkCampanhaPromotor (cria CAMPANHA_PROMOTOR com RAIO=20)
    → getComunityNearbyOficinas(lat, long, raio, empresaSlug)
      → Query comunidade + filtro Haversine por raio
        → createRotas(ID_CAMPANHA_PROMOTOR, [ID_OFICINA...])
```

### Query Base - Oficinas da Comunidade

```sql
SELECT 
  ce."id_oficina",
  ce."razao_social",
  ce."cnpj",
  ce."status_cadastro",
  ce."dt_atualizado",
  ce."status_receita",
  ce."longitude",
  ce."latitude",
  ce."logradouro",
  ce."rua",
  ce."bairro",
  ce."cidade",
  ce."estado",
  ce."numero",
  ce."cep",
  ce."telefone"
FROM "OFICINA_PORTAL"."COMMUNITIES" cm
INNER JOIN "MAIN_REGISTER"."USUARIO_COMMUNITY" uc
  ON cm."CommunityID" = uc."id_community"
INNER JOIN "MAIN_REGISTER"."USUARIO" us
  ON us."ID_USUARIO" = uc."id_usuario"
INNER JOIN "dw"."cadastro_empresa" ce
  ON ce."id_oficina" = us."ID_OFICINA"
WHERE cm."EmpresaSlug" = $1
  AND ce."longitude" IS NOT NULL
  AND ce."latitude" IS NOT NULL
  AND ce."status_receita" = 'ATIVA'
```

O filtro por distância (Haversine) será aplicado no WHERE com o raio em km:

```sql
AND (
  6371 * acos(
    cos(radians($2)) * cos(radians(ce."latitude")) *
    cos(radians(ce."longitude") - radians($3)) +
    sin(radians($2)) * sin(radians(ce."latitude"))
  )
) <= $4
```

Parâmetros: `$1` = empresaSlug, `$2` = latitude promotor, `$3` = longitude promotor, `$4` = raio km

### Dados de Retorno (getComunityNearbyOficinas)

Mesmo formato da `findNearestOficinas`, todos vindos de `dw.cadastro_empresa`:

```ts
{
  ID_OFICINA: number;
  LATITUDE: number;
  LONGITUDE: number;
  NOME_FANTASIA: string; // razao_social de cadastro_empresa
  ENDERECO: string;      // logradouro + rua
  BAIRRO: string;
  CIDADE: string;
  ESTADO: string;
  NUMERO: string;
  CEP: string;
  CNPJ: string;
  TELEFONE: string;
  distance: number;      // distância calculada em km
}
```

### Parâmetros de Entrada

| Param | Tipo | Origem | Descrição |
|-------|------|--------|-----------|
| latitude | number | Promotor.LATITUDE | Calculado a partir do CEP no cadastro |
| longitude | number | Promotor.LONGITUDE | Calculado a partir do CEP no cadastro |
| radiusKm | number | CampanhaPromotor.RAIO | Default 20, alterável |
| empresaSlug | string | Parâmetro do endpoint de criação do promotor (enviado pelo front) | Identifica a comunidade do cliente |

### Endpoint de Debug

```
GET /oficina/community-nearby?latitude=X&longitude=Y&radiusKm=Z&empresaSlug=authomix
```

Retorna as oficinas encontradas com distância calculada para validação manual.

## Regras de Negócio

1. O raio default é 20km, mas vem do campo `CAMPANHA_PROMOTOR.RAIO`
2. Somente oficinas com `status_receita = 'ATIVA'` são consideradas
3. Somente oficinas de usuários inscritos na comunidade do cliente (via EmpresaSlug) são elegíveis
4. Dados de endereço/coordenadas são obtidos de `dw.cadastro_empresa` (maior confiabilidade)
5. As rotas são criadas com STATUS = 'BACKLOG' (default da entidade)
6. Se o promotor não tiver lat/long (CEP inválido), a auto-atribuição não ocorre (fail silently com log)
7. A auto-atribuição acontece para cada CAMPANHA_PROMOTOR criado no momento do cadastro

## Dependências

- `GeolocationService.getLatLongByCep` — já existe, converte CEP → lat/long
- `RotaService.createRotas` — já existe, cria rotas em batch
- `CampanhaPromotorService.linkCampanhaPromotor` — já existe, cria vínculo com RAIO

## Out of Scope

| Item | Motivo |
|------|--------|
| Recalcular rotas ao alterar RAIO | Feature futura, requer endpoint específico |
| Otimização de rota (ordenação) | Já existe separadamente em `optimizeAndSaveRoute` |
| Alterar `findNearestOficinas` existente | Continua funcionando como antes para outros fluxos |
| Persistir empresaSlug no banco | Por ora é passado como parâmetro; se necessário no futuro, salvar em Campanha ou Promotor |
