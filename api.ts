import express from "express";
import campanhaRoutes from "./routes/CampanhaRoute";
import campanhaPerguntasRoutes from "./routes/CampanhaPerguntasRoute";
import campanhaResultsRoutes from "./routes/CampanhaResultsRoute";
import promotorRoutes from "./routes/PromotorRoute";
import rotaRoutes from "./routes/RotaRoute";
import oficinaRoutes from "./routes/OficinaRoute";
import testeRotaRoutes from "./routes/TesteRotaRoute";

const routes = (app: express.Application) => {
  app.use("/campanha", campanhaRoutes);
  app.use("/campanha-perguntas", campanhaPerguntasRoutes);
  app.use("/campanha-results", campanhaResultsRoutes);
  app.use("/promotor", promotorRoutes);
  app.use("/rota", rotaRoutes);
  app.use("/oficina", oficinaRoutes);
  app.use("/teste-rota", testeRotaRoutes);
};

export default routes;