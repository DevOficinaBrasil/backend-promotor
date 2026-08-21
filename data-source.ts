import "reflect-metadata";
import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import { join } from "path";

dotenv.config();

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

export default {
  AppDataSourceSync,
};
