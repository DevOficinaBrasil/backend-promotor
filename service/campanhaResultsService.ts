import { AppDataSourceSync } from "../data-source";
import CampanhaResults from "../entities/CampanhaResults";
import RotaPromotor from "../entities/RotaPromotor";
import CampanhaPerguntas from "../entities/CampanhaPerguntas";

export default class CampanhaResultsService {
  /**
   * Creates a new campanha result or updates if it already exists
   * @param resultData - The result data to create/update
   * @returns The created/updated result
   */
  static async saveOrUpdateResult(resultData: Partial<CampanhaResults>): Promise<CampanhaResults> {
    const resultRepository = AppDataSourceSync.getRepository(CampanhaResults);
    const rotaRepository = AppDataSourceSync.getRepository(RotaPromotor);
    const perguntaRepository = AppDataSourceSync.getRepository(CampanhaPerguntas);
    
    // Validate that the rota exists if ID_ROTA is provided
    if (resultData.ID_ROTA) {
      const rotaExists = await rotaRepository.findOne({
        where: { ID_ROTA_PROMOTOR: resultData.ID_ROTA }
      });
      
      if (!rotaExists) {
        throw new Error("Rota não encontrada.");
      }
    }
    
    // Validate that the pergunta exists if ID_PERGUNTA is provided
    if (resultData.ID_PERGUNTA) {
      const perguntaExists = await perguntaRepository.findOne({
        where: { ID_PERGUNTAS: resultData.ID_PERGUNTA }
      });
      
      if (!perguntaExists) {
        throw new Error("Pergunta não encontrada.");
      }
    }
    
    // Check if a result already exists for this rota and pergunta
    let existingResult = null;
    if (resultData.ID_ROTA && resultData.ID_PERGUNTA) {
      existingResult = await resultRepository.findOne({
        where: {
          ID_ROTA: resultData.ID_ROTA,
          ID_PERGUNTA: resultData.ID_PERGUNTA
        }
      });
    }
    
    if (existingResult) {
      // Update existing result
      Object.assign(existingResult, resultData);
      const updatedResult = await resultRepository.save(existingResult);
      return updatedResult;
    } else {
      // Create new result
      const novoResult = resultRepository.create(resultData);
      const resultSalvo = await resultRepository.save(novoResult);
      return resultSalvo;
    }
  }

  /**
   * Updates an existing campanha result by ID
   * @param id - The result ID to update
   * @param resultData - The result data to update
   * @returns The updated result or null if not found
   */
  static async updateResult(id: number, resultData: Partial<CampanhaResults>): Promise<CampanhaResults | null> {
    const resultRepository = AppDataSourceSync.getRepository(CampanhaResults);
    const rotaRepository = AppDataSourceSync.getRepository(RotaPromotor);
    const perguntaRepository = AppDataSourceSync.getRepository(CampanhaPerguntas);
    
    // Find the result by ID
    const resultExistente = await resultRepository.findOne({
      where: { ID_CAMPANHA_RESULTS: id }
    });

    if (!resultExistente) {
      return null;
    }

    // Validate that the rota exists if ID_ROTA is being updated
    if (resultData.ID_ROTA) {
      const rotaExists = await rotaRepository.findOne({
        where: { ID_ROTA_PROMOTOR: resultData.ID_ROTA }
      });
      
      if (!rotaExists) {
        throw new Error("Rota não encontrada.");
      }
    }
    
    // Validate that the pergunta exists if ID_PERGUNTA is being updated
    if (resultData.ID_PERGUNTA) {
      const perguntaExists = await perguntaRepository.findOne({
        where: { ID_PERGUNTAS: resultData.ID_PERGUNTA }
      });
      
      if (!perguntaExists) {
        throw new Error("Pergunta não encontrada.");
      }
    }

    // Update the result fields
    Object.assign(resultExistente, resultData);
    
    const resultAtualizado = await resultRepository.save(resultExistente);
    
    return resultAtualizado;
  }

  /**
   * Finds a campanha result by ID
   * @param id - The result ID to find
   * @returns The result or null if not found
   */
  static async findResultById(id: number): Promise<CampanhaResults | null> {
    const resultRepository = AppDataSourceSync.getRepository(CampanhaResults);
    
    const result = await resultRepository.findOne({
      where: { ID_CAMPANHA_RESULTS: id },
      relations: ['rota', 'pergunta']
    });

    return result;
  }

  /**
   * Gets all results for a specific rota
   * @param rotaId - The rota ID
   * @returns Array of results for the rota
   */
  static async getResultsByRotaId(rotaId: number): Promise<CampanhaResults[]> {
    const resultRepository = AppDataSourceSync.getRepository(CampanhaResults);
    
    const results = await resultRepository.find({
      where: { ID_ROTA: rotaId },
      relations: ['rota', 'pergunta'],
      order: {
        CREATED_AT: 'DESC',
      },
    });

    return results;
  }

  /**
   * Gets all results for a specific campanha
   * @param campanhaId - The campanha ID
   * @returns Array of results for the campanha
   */
  static async getResultsByCampanhaId(campanhaId: number): Promise<CampanhaResults[]> {
    const resultRepository = AppDataSourceSync.getRepository(CampanhaResults);
    
    // Query results by joining through the relationship chain:
    // CampanhaResults -> RotaPromotor -> CampanhaPromotor -> Campanha
    const results = await resultRepository
      .createQueryBuilder('result')
      .leftJoinAndSelect('result.rota', 'rota')
      .leftJoinAndSelect('result.pergunta', 'pergunta')
      .leftJoin('rota.campanhaPromotor', 'campanhaPromotor')
      .where('campanhaPromotor.ID_CAMPANHA = :campanhaId', { campanhaId })
      .orderBy('result.CREATED_AT', 'DESC')
      .getMany();

    return results;
  }
}
