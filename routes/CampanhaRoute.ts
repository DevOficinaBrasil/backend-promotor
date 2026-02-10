import { Router } from "express";
import CampanhaController from "../controllers/campanhaController";

const router = Router();

// Create a new campaign
router.post("/", CampanhaController.createCampanha);

// Update an existing campaign
router.put("/:id", CampanhaController.updateCampanha);

export default router;
