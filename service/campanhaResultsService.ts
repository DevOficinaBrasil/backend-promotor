import { AppDataSourceSync } from "../data-source";
import CampanhaResults from "../entities/CampanhaResults";
import RotaPromotor from "../entities/RotaPromotor";
import CampanhaPerguntas from "../entities/CampanhaPerguntas";

export default class CampanhaResultsService {
  private static getResultRepo() {
    return AppDataSourceSync.getRepository(CampanhaResults);
  }

  private static getRotaRepo() {
    return AppDataSourceSync.getRepository(RotaPromotor);
  }

  private static getPerguntaRepo() {
    return AppDataSourceSync.getRepository(CampanhaPerguntas);
  }

  /**
   * Creates a new campanha result or updates if it already exists
   */
  static async saveOrUpdateResult(resultData: Partial<CampanhaResults>): Promise<CampanhaResults> {
    const resultRepo = this.getResultRepo();
    const rotaRepo = this.getRotaRepo();
    const perguntaRepo = this.getPerguntaRepo();
    
    // Validate that the rota exists if ID_ROTA is provided
    if (resultData.ID_ROTA) {
      const rotaExists = await rotaRepo.findOne({
        where: { ID_ROTA_PROMOTOR: resultData.ID_ROTA }
      });
      
      if (!rotaExists) {
        throw new Error("Rota não encontrada.");
      }
    }
    
    // Validate that the pergunta exists if ID_PERGUNTA is provided
    if (resultData.ID_PERGUNTA) {
      const perguntaExists = await perguntaRepo.findOne({
        where: { ID_PERGUNTAS: resultData.ID_PERGUNTA }
      });
      
      if (!perguntaExists) {
        throw new Error("Pergunta não encontrada.");
      }
    }
    
    // Check if a result already exists for this rota and pergunta (both DBs)
    let existingResult = null;
    if (resultData.ID_ROTA && resultData.ID_PERGUNTA) {
      existingResult = await resultRepo.findOne({
        where: {
          ID_ROTA: resultData.ID_ROTA,
          ID_PERGUNTA: resultData.ID_PERGUNTA
        }
      });
    }
    
    if (existingResult) {
      // Update existing result (saves to new DB)
      Object.assign(existingResult, resultData);
      const updatedResult = await resultRepo.save(existingResult);
      return updatedResult;
    } else {
      // Create new result (on new DB)
      const novoResult = resultRepo.create(resultData);
      const resultSalvo = await resultRepo.save(novoResult);
      return resultSalvo;
    }
  }

  /**
   * Updates an existing campanha result by ID
   */
  static async updateResult(id: number, resultData: Partial<CampanhaResults>): Promise<CampanhaResults | null> {
    const resultRepo = this.getResultRepo();
    const rotaRepo = this.getRotaRepo();
    const perguntaRepo = this.getPerguntaRepo();
    
    // Find the result by ID (searches both DBs)
    const resultExistente = await resultRepo.findOne({
      where: { ID_CAMPANHA_RESULTS: id }
    });

    if (!resultExistente) {
      return null;
    }

    // Validate that the rota exists if ID_ROTA is being updated
    if (resultData.ID_ROTA) {
      const rotaExists = await rotaRepo.findOne({
        where: { ID_ROTA_PROMOTOR: resultData.ID_ROTA }
      });
      
      if (!rotaExists) {
        throw new Error("Rota não encontrada.");
      }
    }
    
    // Validate that the pergunta exists if ID_PERGUNTA is being updated
    if (resultData.ID_PERGUNTA) {
      const perguntaExists = await perguntaRepo.findOne({
        where: { ID_PERGUNTAS: resultData.ID_PERGUNTA }
      });
      
      if (!perguntaExists) {
        throw new Error("Pergunta não encontrada.");
      }
    }

    // Update the result fields (saves to new DB)
    Object.assign(resultExistente, resultData);
    
    const resultAtualizado = await resultRepo.save(resultExistente);
    
    return resultAtualizado;
  }

  /**
   * Finds a campanha result by ID
   */
  static async findResultById(id: number): Promise<CampanhaResults | null> {
    const resultRepo = this.getResultRepo();
    
    const result = await resultRepo.findOne({
      where: { ID_CAMPANHA_RESULTS: id },
      relations: ['rota', 'pergunta']
    });

    return result;
  }

  /**
   * Gets all results for a specific rota
   */
  static async getResultsByRotaId(rotaId: number): Promise<CampanhaResults[]> {
    const resultRepo = this.getResultRepo();
    
    const results = await resultRepo.find({
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
   */
  static async getResultsByCampanhaId(campanhaId: number): Promise<CampanhaResults[]> {
    const resultRepo = this.getResultRepo();
    
    const results = await resultRepo.createQueryBuilder('result')
      .leftJoinAndSelect('result.rota', 'rota')
      .leftJoinAndSelect('result.pergunta', 'pergunta')
      .leftJoinAndSelect('pergunta.opcoes', 'opcoes')
      .leftJoinAndSelect('rota.campanhaPromotor', 'campanhaPromotor')
      .leftJoinAndSelect('campanhaPromotor.promotor', 'promotor')
      .where('campanhaPromotor.ID_CAMPANHA = :campanhaId', { campanhaId })
      .orderBy('result.CREATED_AT', 'DESC')
      .getMany();

    return results;
  }
}
