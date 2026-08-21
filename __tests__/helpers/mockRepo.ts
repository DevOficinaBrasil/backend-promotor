/**
 * Mock de um Repository do TypeORM, devolvido por AppDataSourceSync.getRepository
 * nos testes unitários dos services.
 */
export function createMockRepo() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: unknown) => Promise.resolve(data)),
    softDelete: jest.fn(),
    update: jest.fn(),
    remove: jest.fn((data: unknown) => Promise.resolve(data)),
    createQueryBuilder: jest.fn(),
  };
}
