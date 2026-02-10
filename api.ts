import express from "express";
import modeloRoutes from "./routes/ModeloRoute";
import campanhaRoutes from "./routes/CampanhaRoute";
import promotorRoutes from "./routes/PromotorRoute";

const routes = (app: express.Application) => {
  app.use("/modelo", modeloRoutes);
  app.use("/campanha", campanhaRoutes);
  app.use("/promotor", promotorRoutes);
};

export default routes;