dotenv.config();
routes(app);
const app = express();
app.use(express.json());
routes(app);
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
