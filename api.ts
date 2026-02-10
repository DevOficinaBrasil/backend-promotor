import express from "express";
import modeloRoutes from "./routes/ModeloRoute";
import campanhaRoutes from "./routes/CampanhaRoute";

const routes = (app: express.Application) => {
  app.use("/modelo", modeloRoutes);
  app.use("/campanha", campanhaRoutes);
};

export default routes;