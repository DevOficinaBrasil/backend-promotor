# 📖 Guia de Documentação de APIs

Este documento explica como implementar e manter a documentação automática das APIs do projeto usando **Zod + zod-to-openapi + Scalar**.

## 🎯 **Visão Geral do Sistema**

### **Arquitetura da Documentação**
- **Schemas Zod**: Definição única de tipos e validações
- **zod-to-openapi**: Conversão automática para especificação OpenAPI
- **Scalar**: Interface visual moderna para a documentação
- **Validação Automática**: Middleware que valida requisições usando os schemas

### **Benefícios**
✅ **Uma única fonte de verdade** - Schema define validação E documentação  
✅ **Documentação sempre atualizada** - Gerada automaticamente do código  
✅ **Validação automática** - Erros padronizados e claros  
✅ **Type Safety** - TypeScript infere tipos dos schemas  
✅ **Manutenção mínima** - Zero duplicação de código  

---

## 🚀 **Implementando uma Nova API**

### **Passo 1: Criar o Schema**

Crie um arquivo em `schemas/nomeEntidade.ts`:

```typescript
import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { ErrorResponseSchema, SuccessResponseSchema } from './common';

extendZodWithOpenApi(z);

// Schema da entidade principal
export const UsuarioSchema = z.object({
  id: z.number(),
  nome: z.string().min(1),
  email: z.string().email(),
  ativo: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
}).openapi({
  description: 'Usuario entity',
  example: {
    id: 1,
    nome: 'João Silva',
    email: 'joao@email.com',
    ativo: true,
    createdAt: '2023-01-01T00:00:00Z',
    updatedAt: '2023-01-01T00:00:00Z'
  }
});

// Schema para criação
export const CreateUsuarioSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('Email deve ser válido'),
  ativo: z.boolean().default(true)
}).openapi({
  description: 'Schema for creating a new usuario',
  example: {
    nome: 'João Silva',
    email: 'joao@email.com',
    ativo: true
  }
});

// Schema para atualização (todos os campos opcionais)
export const UpdateUsuarioSchema = CreateUsuarioSchema.partial().openapi({
  description: 'Schema for updating a usuario'
});

// Schemas de resposta
export const UsuarioResponseSchema = z.object({
  data: UsuarioSchema
});

export const UsuarioListResponseSchema = z.object({
  data: z.array(UsuarioSchema)
});

// Schema de parâmetros
export const UsuarioParamSchema = z.object({
  usuarioId: z.string().min(1)
});
```

### **Passo 2: Criar a Rota Documentada**

Crie/edite o arquivo em `routes/usuarioRoute.ts`:

```typescript
import { createDocumentedRouter, createDocumentedRoute } from '../utils/routeDocumentation';
import { 
  CreateUsuarioSchema, 
  UpdateUsuarioSchema, 
  UsuarioParamSchema,
  UsuarioResponseSchema,
  UsuarioListResponseSchema
} from '../schemas/usuario';
import { ErrorResponseSchema, SuccessResponseSchema } from '../schemas/common';
import UsuarioController from '../controllers/usuarioController';

const usuarioRoutes = createDocumentedRouter();

// GET /getAllUsuario
createDocumentedRoute(usuarioRoutes, {
  method: 'get',
  path: '/getAllUsuario',
  handler: UsuarioController.getAllUsuario,
  documentation: {
    tags: ['Usuario'],
    summary: 'Get all usuarios',
    description: 'Retrieve a list of all usuarios',
    responses: {
      200: {
        description: 'List of usuarios retrieved successfully',
        schema: UsuarioListResponseSchema
      },
      500: {
        description: 'Internal server error',
        schema: ErrorResponseSchema
      }
    }
  }
});

// POST /createUsuario - COM VALIDAÇÃO
createDocumentedRoute(usuarioRoutes, {
  method: 'post',
  path: '/createUsuario',
  handler: UsuarioController.createUsuario,
  schemas: {
    body: CreateUsuarioSchema  // ← Validação automática!
  },
  documentation: {
    tags: ['Usuario'],
    summary: 'Create a new usuario',
    description: 'Create a new usuario with the provided data',
    responses: {
      201: {
        description: 'Usuario created successfully',
        schema: UsuarioResponseSchema
      },
      400: {
        description: 'Invalid input data',
        schema: ErrorResponseSchema
      }
    }
  }
});

export default usuarioRoutes;
```

### **Passo 3: Registrar a Rota**

Adicione no arquivo `api.ts`:

```typescript
import usuarioRoutes from "./routes/usuarioRoute";

const routes = (app: express.Application) => {
    // ... outras rotas existentes
    app.use("/usuario", usuarioRoutes);
};
```

### **Passo 4: Adicionar Tag (Opcional)**

Para organizar melhor na documentação, adicione em `config/openapi.ts`:

```typescript
tags: [
  // ... tags existentes
  { name: 'Usuario', description: 'Operations related to usuarios' },
],
```

---

## 🔧 **Ajustando Rotas Existentes**

### **Cenário 1: Rota Simples sem Validação**

**Antes:**
```typescript
app.get('/usuarios', UsuarioController.getAll);
```

**Depois:**
```typescript
createDocumentedRoute(router, {
  method: 'get',
  path: '/usuarios',
  handler: UsuarioController.getAll,
  documentation: {
    tags: ['Usuario'],
    summary: 'Get all usuarios',
    responses: {
      200: { description: 'Success', schema: UsuarioListResponseSchema }
    }
  }
});
```

### **Cenário 2: Adicionando Validação**

**Antes:**
```typescript
app.post('/usuarios', UsuarioController.create);
```

**Depois:**
```typescript
createDocumentedRoute(router, {
  method: 'post',
  path: '/usuarios',
  handler: UsuarioController.create,
  schemas: {
    body: CreateUsuarioSchema  // ← Nova validação
  },
  documentation: {
    tags: ['Usuario'],
    summary: 'Create usuario',
    responses: {
      201: { description: 'Created', schema: UsuarioResponseSchema }
    }
  }
});
```

### **Cenário 3: Rota com Parâmetros**

**Antes:**
```typescript
app.get('/usuarios/:id', UsuarioController.getById);
```

**Depois:**
```typescript
createDocumentedRoute(router, {
  method: 'get',
  path: '/usuarios/:id',
  handler: UsuarioController.getById,
  schemas: {
    params: UsuarioParamSchema  // ← Validação de parâmetros
  },
  documentation: {
    tags: ['Usuario'],
    summary: 'Get usuario by ID',
    responses: {
      200: { description: 'Usuario found', schema: UsuarioResponseSchema },
      404: { description: 'Usuario not found', schema: ErrorResponseSchema }
    }
  }
});
```

---

## 📝 **Padrões e Convenções**

### **Nomenclatura de Schemas**
```typescript
// Entidade principal
export const EntitySchema = z.object({...});

// Criação
export const CreateEntitySchema = z.object({...});

// Atualização
export const UpdateEntitySchema = CreateEntitySchema.partial();

// Respostas
export const EntityResponseSchema = z.object({ data: EntitySchema });
export const EntityListResponseSchema = z.object({ data: z.array(EntitySchema) });

// Parâmetros
export const EntityParamSchema = z.object({ entityId: z.string() });
```

### **Tags por Domínio**
- `Marca` - Operações de marcas
- `Modelo` - Operações de modelos  
- `Sistema` - Operações de sistemas
- `Versao` - Operações de versões
- `Peca` - Operações de peças
- `Usuario` - Operações de usuários (exemplo)

### **Status Codes Padrão**
```typescript
responses: {
  200: { description: 'Success', schema: ResponseSchema },
  201: { description: 'Created', schema: ResponseSchema },
  400: { description: 'Bad Request', schema: ErrorResponseSchema },
  404: { description: 'Not Found', schema: ErrorResponseSchema },
  500: { description: 'Internal Server Error', schema: ErrorResponseSchema }
}
```

---

## ⚡ **Validação Automática**

### **Tipos de Validação Disponíveis**

```typescript
schemas: {
  body: CreateEntitySchema,    // Valida req.body
  params: EntityParamSchema,   // Valida req.params
  query: SearchQuerySchema     // Valida req.query
}
```

### **Tratamento de Erros**

O sistema automaticamente retorna erros padronizados:

```json
{
  "error": "Validation Error",
  "message": "Invalid input data",
  "details": [
    {
      "field": "email",
      "message": "Email deve ser válido",
      "code": "invalid_string"
    }
  ]
}
```

---

## 🔍 **Acessando a Documentação**

### **URLs Disponíveis**
- **Interface Scalar**: `http://localhost:3333/docs`
- **OpenAPI JSON**: `http://localhost:3333/openapi.json`

### **Recursos da Interface**
- 🎨 **Interface moderna** com tema purple
- 📋 **Try it out** - Testar APIs direto na documentação
- 🔍 **Busca** - Localizar rapidamente endpoints
- 📖 **Schemas** - Visualizar estruturas de dados
- ⚡ **Validação em tempo real** - Ver erros antes de enviar

---

## ✅ **Checklist para Nova API**

### **Antes de Implementar**
- [ ] Definir estrutura da entidade
- [ ] Identificar operações necessárias (CRUD)
- [ ] Definir regras de validação

### **Durante a Implementação**
- [ ] Criar schema em `schemas/entidade.ts`
- [ ] Implementar rota em `routes/entidadeRoute.ts`
- [ ] Registrar rota em `api.ts`
- [ ] Adicionar tag em `config/openapi.ts` (se necessário)

### **Após a Implementação**
- [ ] Testar validação com dados inválidos
- [ ] Verificar documentação em `/docs`
- [ ] Testar "Try it out" na interface
- [ ] Validar exemplos nos schemas

---

## 🐛 **Troubleshooting**

### **Erro de Compilação TypeScript**
```bash
# Verificar se todos os imports estão corretos
# Verificar se schemas estão sendo exportados corretamente
```

### **Rota não Aparece na Documentação**
1. Verificar se a rota está registrada em `api.ts`
2. Verificar se `createDocumentedRoute` está sendo usado
3. Reiniciar o servidor (`npm run dev`)

### **Validação não Funciona**
1. Verificar se `schemas` está definido no `createDocumentedRoute`
2. Verificar se o schema está correto
3. Testar o schema isoladamente

### **Documentação não Carrega**
1. Acessar `http://localhost:3333/openapi.json` para ver se o JSON está sendo gerado
2. Verificar logs do servidor por erros
3. Verificar se a porta está correta (3333)

---

## 📚 **Recursos Adicionais**

### **Documentação Oficial**
- [Zod](https://zod.dev/) - Biblioteca de validação
- [zod-to-openapi](https://github.com/asteasolutions/zod-to-openapi) - Conversão para OpenAPI
- [Scalar](https://github.com/scalar/scalar) - Interface de documentação

### **Exemplos no Projeto**
- `schemas/marca.ts` - Schema completo com validações
- `routes/marcaRoute.ts` - Rota completa documentada
- `middlewares/validation.ts` - Middleware de validação

---

*Documentação criada em {{ date }} - Mantenha sempre atualizada!* 🚀