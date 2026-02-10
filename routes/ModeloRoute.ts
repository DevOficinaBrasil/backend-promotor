// Exemplo de arquivo de rota Express
// Este arquivo serve apenas como referência de estrutura.

import { Router } from "express";

const router = Router();

// Exemplo de rota PUT
router.put("/update-example", (req, res) => {
	// Lógica de exemplo
	return res.status(200).json({ message: "Exemplo de rota executado com sucesso." });
});

export default router;