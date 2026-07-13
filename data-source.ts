import "reflect-metadata";
import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import { join } from "path";

dotenv.config();

// Primary DataSource - Banco CORRETO (PRD)
export const AppDataSourceSync = new DataSource({
  type: process.env.DB_TYPE as any,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [join(__dirname, "./entities/*.{ts,js}")],
  extra: {
    trustServerCertificate: true,
  },
});

// Legacy DataSource - Banco ANTIGO (DEV) - READ-ONLY
// Ativado apenas quando LEGACY_DB_ENABLED=true
export const isLegacyEnabled = (): boolean =>
  process.env.LEGACY_DB_ENABLED === "true" && !!process.env.LEGACY_DB_HOST;

export const LegacyDataSource = new DataSource({
  type: (process.env.LEGACY_DB_TYPE || process.env.DB_TYPE) as any,
  host: process.env.LEGACY_DB_HOST || process.env.DB_HOST,
  port: parseInt(process.env.LEGACY_DB_PORT || process.env.DB_PORT || "5432"),
  username: process.env.LEGACY_DB_USERNAME || process.env.DB_USERNAME,
  password: process.env.LEGACY_DB_PASSWORD || process.env.DB_PASSWORD,
  database: process.env.LEGACY_DB_DATABASE || process.env.DB_DATABASE,
  entities: [join(__dirname, "./entities/*.{ts,js}")],
  extra: {
    trustServerCertificate: true,
  },
  // Read-only: sem synchronize nem migrations
  synchronize: false,
  migrationsRun: false,
});

// Exportação dos DataSources
export default {
  AppDataSourceSync,
  LegacyDataSource,
};
