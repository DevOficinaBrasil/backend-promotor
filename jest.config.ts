import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "js", "json"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  clearMocks: true,
  verbose: true,
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1" // como o projeto está na raiz
  },
  coveragePathIgnorePatterns: [
    "entities",
    "data-source.ts",
    "utils"
  ]
};

export default config;