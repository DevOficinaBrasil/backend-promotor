# Entidade OFICINA

Este documento descreve a entidade TypeORM OFICINA (Oficina) que representa os dados de oficinas/workshops cadastrados no sistema.

## Estrutura do Schema

A entidade está no schema `MAIN_REGISTER` do PostgreSQL.

## Tabela

**Nome**: `MAIN_REGISTER.OFICINA`

## Campos

### Identificação
- `ID_OFICINA` (PK): Identificador único da oficina (auto-incremento)
- `ID_VW` (integer, nullable): Identificador externo VW

### Dados da Empresa
- `NOME_FANTASIA` (varchar 200, nullable): Nome fantasia da oficina
- `RAZAO_SOCIAL` (varchar 200, nullable): Razão social da empresa
- `CNPJ` (varchar 50, nullable): CNPJ da empresa

### Contato
- `TELEFONE` (varchar 20, nullable): Telefone de contato
- `EMAIL_COMERCIAL` (varchar 150, nullable): E-mail comercial
- `SITE` (varchar 200, nullable): Website da oficina

### Endereço
- `ENDERECO` (varchar 200, nullable): Endereço completo
- `NUMERO` (varchar 200, nullable): Número do endereço
- `BAIRRO` (varchar 200, nullable): Bairro
- `CIDADE` (varchar 150, nullable): Cidade
- `ESTADO` (varchar 50, nullable): Estado
- `CEP` (varchar 30, nullable): CEP
- `COMPLEMENTO` (varchar 150, nullable): Complemento do endereço

### Geolocalização
- `LONGITUDE` (varchar 20, nullable): Longitude da localização
- `LATITUDE` (varchar 20, nullable): Latitude da localização

### Informações Operacionais
- `QUANTIDADE_FUNCIONARIOS` (varchar 85, nullable): Quantidade de funcionários
- `ESTOQUE_PECAS` (varchar 50, nullable): Informações sobre estoque de peças
- `QUANTIDADE_VEICULOS` (varchar 50, nullable): Quantidade de veículos atendidos
- `ELEVADOR` (varchar 30, nullable): Informações sobre elevador
- `QUANTIDADE_ELEVADOR` (varchar 50, nullable): Quantidade de elevadores
- `RAMO_ATIVIDADE` (integer, nullable): Código do ramo de atividade

### Status e Controle
- `ATIVO` (varchar 20, nullable): Indica se a oficina está ativa
- `STATUS` (varchar 80, nullable): Status da oficina
- `ROTA` (varchar 1, nullable): Indicador de rota
- `ORIGEM` (varchar 80, nullable): Origem do cadastro

### Datas
- `DATA_FUNDACAO` (timestamp with time zone, nullable): Data de fundação da oficina
- `DATA_CADASTRO` (timestamp with time zone): Data de cadastro no sistema (auto-gerado)
- `DATA_ALTERACAO` (timestamp with time zone): Data da última alteração (auto-atualizado)

## Relacionamentos

### OneToMany
- `rotasPromotor`: Relação com RotaPromotor - Rotas de promotores associadas à oficina
- `usuarios`: Relação com Usuario - Usuários vinculados à oficina

## Observações

1. **Campos Numéricos como String**: Alguns campos que representam quantidades (QUANTIDADE_FUNCIONARIOS, ESTOQUE_PECAS, etc.) são armazenados como varchar para permitir valores descritivos (ex: "10-20", "Mais de 50", etc.)

2. **Geolocalização**: Os campos LONGITUDE e LATITUDE permitem armazenar a localização geográfica da oficina para funcionalidades de mapeamento e roteirização.

3. **Timestamps**: Os campos DATA_CADASTRO e DATA_ALTERACAO são gerenciados automaticamente pelo TypeORM através dos decorators @CreateDateColumn e @UpdateDateColumn.

4. **Soft Delete**: A entidade não implementa soft delete, mas pode ser controlada através do campo ATIVO.

## Exemplo de Uso

```typescript
import Oficina from "./entities/Oficina";
import { AppDataSourceSync } from "./data-source";

// Criar uma nova oficina
const oficinaRepository = AppDataSourceSync.getRepository(Oficina);

const novaOficina = oficinaRepository.create({
  NOME_FANTASIA: "Auto Mecânica Silva",
  RAZAO_SOCIAL: "Silva & Cia Auto Mecânica LTDA",
  CNPJ: "12.345.678/0001-90",
  EMAIL_COMERCIAL: "contato@autosilva.com.br",
  TELEFONE: "(11) 98765-4321",
  ENDERECO: "Rua das Flores",
  NUMERO: "123",
  BAIRRO: "Centro",
  CIDADE: "São Paulo",
  ESTADO: "SP",
  CEP: "01234-567",
  ATIVO: "S",
  QUANTIDADE_FUNCIONARIOS: "15",
  RAMO_ATIVIDADE: 1
});

const oficinaSalva = await oficinaRepository.save(novaOficina);

// Buscar oficina com relacionamentos
const oficina = await oficinaRepository.findOne({
  where: { ID_OFICINA: 1 },
  relations: ['rotasPromotor', 'usuarios']
});
```

## Schema SQL

```sql
CREATE TABLE "MAIN_REGISTER"."OFICINA"(
    "ID_OFICINA" SERIAL NOT NULL,
    "NOME_FANTASIA" varchar(200),
    "RAZAO_SOCIAL" varchar(200),
    "CNPJ" varchar(50),
    "SITE" varchar(200),
    "QUANTIDADE_FUNCIONARIOS" varchar(85),
    "ESTOQUE_PECAS" varchar(50),
    "QUANTIDADE_VEICULOS" varchar(50),
    "ATIVO" varchar(20),
    "ELEVADOR" varchar(30),
    "QUANTIDADE_ELEVADOR" varchar(50),
    "TELEFONE" varchar(20),
    "EMAIL_COMERCIAL" varchar(150),
    "ORIGEM" varchar(80),
    "RAMO_ATIVIDADE" integer,
    "ENDERECO" varchar(200),
    "BAIRRO" varchar(200),
    "NUMERO" varchar(200),
    "ESTADO" varchar(50),
    "CIDADE" varchar(150),
    "CEP" varchar(30),
    "COMPLEMENTO" varchar(150),
    "STATUS" varchar(80),
    "ROTA" varchar(1),
    "LONGITUDE" varchar(20),
    "LATITUDE" varchar(20),
    "DATA_FUNDACAO" timestamp with time zone,
    "DATA_CADASTRO" timestamp with time zone,
    "DATA_ALTERACAO" timestamp with time zone,
    "ID_VW" integer,
    PRIMARY KEY(ID_OFICINA)
);
```
