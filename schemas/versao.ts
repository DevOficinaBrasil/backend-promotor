// Exemplo de schema usando Zod
// Este arquivo serve apenas como referência de estrutura.

import { z } from 'zod';

// Exemplo de schema de entidade
export const ExampleSchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(100),
  createdAt: z.string()
});

// Exemplo de schema para criação
export const CreateExampleSchema = z.object({
  data: z.object({
    name: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome deve ter no máximo 100 caracteres')
  })
});

// Exemplo de schema para atualização
export const UpdateExampleSchema = CreateExampleSchema.partial();

// Exemplo de schema de resposta
export const ExampleResponseSchema = z.object({
  status: z.boolean().default(true),
  data: ExampleSchema
});