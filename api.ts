import express from "express";
import campanhaRoutes from "./routes/CampanhaRoute";
import promotorRoutes from "./routes/PromotorRoute";

const routes = (app: express.Application) => {
  app.use("/campanha", campanhaRoutes);
  app.use("/promotor", promotorRoutes);
};

export default routes;