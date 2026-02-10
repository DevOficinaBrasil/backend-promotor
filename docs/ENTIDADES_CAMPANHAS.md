# Entidades do Sistema de Campanhas

Este documento descreve as entidades TypeORM criadas para o sistema de gerenciamento de campanhas.

## ⚠️ Nota Importante sobre Nomenclatura

Os nomes dos campos nas entidades seguem **exatamente** a nomenclatura definida no schema do banco de dados PostgreSQL, incluindo possíveis erros de ortografia (ex: `OBEJTIVO` ao invés de `OBJETIVO`, `EM ANDANMENTO` ao invés de `EM ANDAMENTO`). Esta decisão foi tomada para garantir compatibilidade total com o schema existente.

## Estrutura do Schema

Todas as entidades estão no schema `CAMPANHAS_OB` do PostgreSQL.

## Entidades

### 1. Campanha
Entidade principal que representa uma campanha de marketing/promoção.

**Tabela**: `CAMPANHAS_OB.CAMPANHA`

**Campos**:
- `ID_CAMPANHA` (PK): Identificador único da campanha
- `NOME`: Nome da campanha (obrigatório)
- `OBEJTIVO`: Objetivo da campanha
- `PONTO_INICIAL`: Ponto inicial (tipo LOCATION no PostgreSQL, armazenado como TEXT)
- `ID_CLIENT`: ID do cliente externo
- `START_TIME`: Data/hora de início
- `END_TIME`: Data/hora de término
- `CREATED_BY`: ID do usuário que criou
- `CREATED_AT`: Data de criação (automático)
- `UPDATED_AT`: Data de atualização (automático)
- `DELETED_AT`: Data de exclusão lógica (soft delete)

**Relacionamentos**:
- `campanhaPromotores`: OneToMany com CampanhaPromotor
- `campanhaPerguntas`: OneToMany com CampanhaPerguntas

---

### 2. Promotor
Entidade que representa um promotor de campanhas.

**Tabela**: `CAMPANHAS_OB.PROMOTOR`

**Campos**:
- `ID_PROMOTOR` (PK): Identificador único do promotor
- `NOME`: Nome do promotor (obrigatório)
- `EMAIL`: E-mail (único)
- `CPF`: CPF (único, 14 caracteres com formatação)
- `SENHA`: Senha do promotor
- `ID_CLIENT`: ID do cliente externo
- `CREATED_BY`: ID do usuário que criou
- `CREATED_AT`: Data de criação (automático)
- `UPDATED_AT`: Data de atualização (automático)
- `DELETED_AT`: Data de exclusão lógica (soft delete)

**Relacionamentos**:
- `campanhaPromotores`: OneToMany com CampanhaPromotor

---

### 3. CampanhaPromotor
Entidade de junção que relaciona Campanha com Promotor (relação N:N).

**Tabela**: `CAMPANHAS_OB.CAMPANHA_PROMOTOR`

**Campos**:
- `ID_CAMPANHA_PROMOTOR` (PK): Identificador único
- `ID_CAMPANHA` (FK): Referência para Campanha
- `ID_PROMOTOR` (FK): Referência para Promotor
- `CREATED_AT`: Data de criação (automático)
- `UPDATED_AT`: Data de atualização (automático)
- `DELETED_AT`: Data de exclusão lógica (soft delete)

**Relacionamentos**:
- `campanha`: ManyToOne com Campanha
- `promotor`: ManyToOne com Promotor
- `rotasPromotor`: OneToMany com RotaPromotor

---

### 4. CampanhaPerguntas
Entidade que representa as perguntas de uma campanha.

**Tabela**: `CAMPANHAS_OB.CAMPANHA_PERGUNTAS`

**Campos**:
- `ID_PERGUNTAS` (PK): Identificador único da pergunta
- `ID_CAMPANHA` (FK): Referência para Campanha
- `PERGUNTA`: Texto da pergunta (500 caracteres)
- `TIPO`: Tipo da pergunta (ex: múltipla escolha, texto livre, etc.)
- `CREATED_AT`: Data de criação (automático)
- `UPDATED_AT`: Data de atualização (automático)
- `DELETED_AT`: Data de exclusão lógica (soft delete)

**Relacionamentos**:
- `campanha`: ManyToOne com Campanha
- `campanhaResults`: OneToMany com CampanhaResults

---

### 5. RotaPromotor
Entidade que representa a rota de um promotor em uma campanha.

**Tabela**: `CAMPANHAS_OB.ROTA_PROMOTOR`

**Campos**:
- `ID_ROTA_PROMOTOR` (PK): Identificador único da rota
- `ID_OFICINA`: ID da oficina (tabela externa)
- `ID_CAMPANHA_PROMOTOR` (FK): Referência para CampanhaPromotor
- `STATUS`: Status da rota (enum)
  - BACKLOG
  - A CAMINHO
  - EM ANDANMENTO
  - FINALIZADO
  - CANCELADO
- `SUCCESS`: Indica se foi bem-sucedido (boolean)
- `CHECKIN_TIME`: Data/hora do check-in
- `DONE_AT`: Data/hora de conclusão
- `OBS`: Observações (1000 caracteres)
- `CREATED_BY`: ID do usuário que criou
- `CREATED_AT`: Data de criação (automático)
- `UPDATED_AT`: Data de atualização (automático)
- `DELETED_AT`: Data de exclusão lógica (soft delete)

**Relacionamentos**:
- `campanhaPromotor`: ManyToOne com CampanhaPromotor
- `oficina`: ManyToOne com Oficina
- `campanhaResults`: OneToMany com CampanhaResults

**Enum StatusRota**:
```typescript
export enum StatusRota {
  BACKLOG = "BACKLOG",
  A_CAMINHO = "A CAMINHO",
  EM_ANDAMENTO = "EM ANDANMENTO",
  FINALIZADO = "FINALIZADO",
  CANCELADO = "CANCELADO",
}
```

---

### 6. CampanhaResults
Entidade que armazena os resultados/respostas das perguntas em cada rota.

**Tabela**: `CAMPANHAS_OB.CAMPANHA_RESULTS`

**Campos**:
- `ID_CAMPANHA_RESULTS` (PK): Identificador único do resultado
- `ID_ROTA` (FK): Referência para RotaPromotor
- `ID_PERGUNTA` (FK): Referência para CampanhaPerguntas
- `RESPOSTA`: Texto da resposta
- `CREATED_AT`: Data de criação (automático)
- `UPDATED_AT`: Data de atualização (automático)
- `DELETED_AT`: Data de exclusão lógica (soft delete)

**Relacionamentos**:
- `rota`: ManyToOne com RotaPromotor
- `pergunta`: ManyToOne com CampanhaPerguntas

---

### 7. Oficina
Entidade que representa uma oficina mecânica/automotiva.

**Tabela**: `MAIN_REGISTER.OFICINA`

**Campos**:
- `ID_OFICINA` (PK): Identificador único da oficina
- `NOME`: Nome da oficina
- `RAZAO_SOCIAL`: Razão social da oficina
- `CNPJ`: CNPJ da oficina (20 caracteres)
- `EMAIL`: E-mail de contato
- `TELEFONE`: Telefone de contato (20 caracteres)
- `ENDERECO`: Endereço completo
- `CIDADE`: Cidade (100 caracteres)
- `ESTADO`: Estado (2 caracteres - sigla UF)
- `CEP`: CEP (10 caracteres)
- `LOCALIZACAO`: Localização geográfica (tipo LOCATION no PostgreSQL, armazenado como TEXT)
- `ATIVO`: Indicador se a oficina está ativa (1 caractere)
- `CREATED_AT`: Data de criação (automático)
- `UPDATED_AT`: Data de atualização (automático)
- `DELETED_AT`: Data de exclusão lógica (soft delete)

**Relacionamentos**:
- `rotasPromotor`: OneToMany com RotaPromotor
- `usuarios`: OneToMany com Usuario

---

## Diagrama de Relacionamentos

```
Campanha (1) ─────< (N) CampanhaPromotor (N) >───── (1) Promotor
    │                           │
    │                           │
    │                           │
    └──< (N) CampanhaPerguntas  └──< (N) RotaPromotor (N) >───── (1) Oficina
                 │                          │                         │
                 │                          │                         │
                 └─────> (N) CampanhaResults (N) <─────┘              │
                                                                       │
                                                        Usuario (N) >──┘
```

**Observação**: A entidade Oficina está no schema `MAIN_REGISTER`, enquanto as outras entidades do sistema de campanhas estão no schema `CAMPANHAS_OB`.

## Uso

### Exemplo de criação de uma campanha:

```typescript
import { AppDataSourceSync } from './data-source';
import Campanha from './entities/Campanha';

const campanhaRepository = AppDataSourceSync.getRepository(Campanha);

const novaCampanha = new Campanha({
  NOME: "Campanha de Verão 2024",
  OBEJTIVO: "Aumentar vendas",
  START_TIME: new Date("2024-01-01"),
  END_TIME: new Date("2024-03-31"),
});

await campanhaRepository.save(novaCampanha);
```

### Exemplo de associação de promotor a uma campanha:

```typescript
import CampanhaPromotor from './entities/CampanhaPromotor';

const campanhaPromotorRepository = AppDataSourceSync.getRepository(CampanhaPromotor);

const associacao = new CampanhaPromotor({
  ID_CAMPANHA: 1,
  ID_PROMOTOR: 1,
});

await campanhaPromotorRepository.save(associacao);
```

### Exemplo de criação de uma oficina:

```typescript
import Oficina from './entities/Oficina';

const oficinaRepository = AppDataSourceSync.getRepository(Oficina);

const novaOficina = new Oficina({
  NOME: "Auto Mecânica São Paulo",
  RAZAO_SOCIAL: "Auto Mecânica SP Ltda",
  CNPJ: "12.345.678/0001-90",
  EMAIL: "contato@automecsp.com.br",
  TELEFONE: "(11) 98765-4321",
  ENDERECO: "Rua das Oficinas, 123",
  CIDADE: "São Paulo",
  ESTADO: "SP",
  CEP: "01234-567",
  ATIVO: "S",
});

await oficinaRepository.save(novaOficina);
```

### Exemplo de criação de rota com oficina:

```typescript
import RotaPromotor from './entities/RotaPromotor';

const rotaRepository = AppDataSourceSync.getRepository(RotaPromotor);

const novaRota = new RotaPromotor({
  ID_CAMPANHA_PROMOTOR: 1,
  ID_OFICINA: 1,
  STATUS: StatusRota.BACKLOG,
});

await rotaRepository.save(novaRota);
```

### Exemplo de consulta com relacionamentos:

```typescript
import { AppDataSourceSync } from './data-source';
import RotaPromotor from './entities/RotaPromotor';

const rotaRepository = AppDataSourceSync.getRepository(RotaPromotor);

// Buscar rota com oficina relacionada
const rotaComOficina = await rotaRepository.findOne({
  where: { ID_ROTA_PROMOTOR: 1 },
  relations: ['oficina', 'campanhaPromotor'],
});

// Acessar nome da oficina com verificação de null
if (rotaComOficina?.oficina) {
  console.log(rotaComOficina.oficina.NOME); // Nome da oficina
}
```

## Soft Delete

Todas as entidades suportam exclusão lógica (soft delete) através do campo `DELETED_AT`. Quando uma entidade é deletada, ao invés de ser removida do banco, ela recebe um timestamp em `DELETED_AT`.

## Timestamps Automáticos

Os campos `CREATED_AT` e `UPDATED_AT` são gerenciados automaticamente pelo TypeORM:
- `CREATED_AT`: Definido na primeira inserção
- `UPDATED_AT`: Atualizado automaticamente a cada modificação
