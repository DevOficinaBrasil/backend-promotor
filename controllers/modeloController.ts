import { Request, Response } from "express";
import ModeloService from "../service/modeloService";

export default class ModeloController {
    static updateExample = async (req: Request, res: Response) => {
        const { exampleField } = req.body;

        if (typeof exampleField !== "string") {
            return res.status(400).json({ message: "Valor inválido para exampleField. Deve ser uma string." });
        }

        // Chama o service de modelo
        const result = await ModeloService.doSomething(exampleField);

        return res.status(200).json({ message: result });
    }
}
