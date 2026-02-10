import express from "express";
import campanhaRoutes from "./routes/CampanhaRoute";
import promotorRoutes from "./routes/PromotorRoute";
import rotaRoutes from "./routes/RotaRoute";

const routes = (app: express.Application) => {
  app.use("/campanha", campanhaRoutes);
  app.use("/promotor", promotorRoutes);
  app.use("/rota", rotaRoutes);
};

export default routes;