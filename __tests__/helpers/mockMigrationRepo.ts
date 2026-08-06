export function createMockRepo() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: unknown) => Promise.resolve(data)),
    saveMany: jest.fn((data: unknown) => Promise.resolve(data)),
    softDelete: jest.fn(),
    update: jest.fn(),
    remove: jest.fn((data: unknown) => Promise.resolve(data)),
    createQueryBuilder: jest.fn(),
    getNewRepo: jest.fn(),
    getLegacyRepoInstance: jest.fn().mockReturnValue(null),
  };
}
