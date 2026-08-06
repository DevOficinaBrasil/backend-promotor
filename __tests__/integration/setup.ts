import "reflect-metadata";
import { AppDataSourceSync } from "../../data-source";

/**
 * Shared setup/teardown for integration tests.
 * Initializes the DB connection before all tests and closes it after.
 */
beforeAll(async () => {
  if (!AppDataSourceSync.isInitialized) {
    await AppDataSourceSync.initialize();
  }
});

afterAll(async () => {
  if (AppDataSourceSync.isInitialized) {
    await AppDataSourceSync.destroy();
  }
});
