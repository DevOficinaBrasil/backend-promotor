export const AppDataSourceSync = {
  getRepository: jest.fn(),
  transaction: jest.fn(),
  query: jest.fn(),
}

export const LegacyDataSource = {
  getRepository: jest.fn(),
  isInitialized: false,
}

export const isLegacyEnabled = jest.fn(() => false);
