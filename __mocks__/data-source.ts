export const AppDataSourceSync = {
  getRepository: jest.fn(),
  query: jest.fn(),
  transaction: jest.fn((cb: Function) => cb({
    create: jest.fn((_: any, data: any) => data),
    save: jest.fn((data: any) => Promise.resolve(data)),
    softDelete: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
  })),
};
