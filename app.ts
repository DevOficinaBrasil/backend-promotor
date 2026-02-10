import express from "express";
import * as dotenv from "dotenv";
import routes from "./api";
import { AppDataSourceSync } from "./data-source";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

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
  .then(() => {
    console.log("Data Source synced has been initialized!");
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
