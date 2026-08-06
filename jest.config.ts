import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "js", "json"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  clearMocks: true,
  verbose: true,
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  coveragePathIgnorePatterns: [
    "entities",
    "data-source.ts",
  ],
  transform: {
    "^.+\.ts$": ["ts-jest", {
      tsconfig: "tsconfig.json",
      diagnostics: { ignoreDiagnostics: [5103] },
    }],
  },
};

export default config;