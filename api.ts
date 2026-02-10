import express from "express";
import modeloRoutes from "./routes/ModeloRoute";

const routes = (app: express.Application) => {
  app.use("/modelo", modeloRoutes);
};

export default routes;