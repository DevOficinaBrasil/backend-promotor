import express from "express";
import * as dotenv from "dotenv";
import routes from "./api";
import { AppDataSourceSync, LegacyDataSource, isLegacyEnabled } from "./data-source";
import cors from "cors";
import { openAPIGenerator } from "./config/openapi";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// OpenAPI JSON endpoint
app.get("/openapi.json", (req, res) => {
  const openApiDocument = openAPIGenerator.generateDocument();
  res.json(openApiDocument);
});

// API documentation route
app.get("/docs", (req, res) => {
  const html = `
    <!doctype html>
    <html>
      <head>
        <title>API Reference</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <script
          id="api-reference"
          data-url="/openapi.json"
          data-configuration='{"theme":"purple"}'></script>
        <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
      </body>
    </html>
  `;
  res.send(html);
});

routes(app);

AppDataSourceSync.initialize()
  .then(async () => {
    console.log("Data Source (PRD) has been initialized!");

    // Inicializar LegacyDataSource se habilitado
    if (isLegacyEnabled()) {
      try {
        await LegacyDataSource.initialize();
        console.log("Legacy Data Source (DEV) has been initialized! (READ-ONLY)");
      } catch (err) {
        console.warn("⚠️ Legacy Data Source failed to initialize (app continues without merge):", (err as Error).message);
      }
    } else {
      console.log("Legacy Data Source is disabled (LEGACY_DB_ENABLED != true)");
    }

    console.log(`Local: http://localhost:${process.env.PORT || 8185}`);
  })
  .catch((err) => {
    console.error("Erro ao acessar banco:", err);
  });

// if (process.env.APP_ENV != "dev") {
//   const cronScheduler = new CronScheduler();
//   cronScheduler.start();
// }

app.listen(process.env.PORT || 8185);

app.get("/ping", (req, res) => res.send({ message: "pong" }));

export default app;
