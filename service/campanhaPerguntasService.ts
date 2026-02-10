import { AppDataSourceSync } from "../data-source";
import CampanhaPerguntas from "../entities/CampanhaPerguntas";
import Campanha from "../entities/Campanha";

export default class CampanhaPerguntasService {
  /**
   * Creates a new campanha pergunta in the database
   * @param perguntaData - The pergunta data to create
   * @returns The created pergunta
   */
  static async createCampanhaPergunta(perguntaData: Partial<CampanhaPerguntas>): Promise<CampanhaPerguntas> {
    const perguntaRepository = AppDataSourceSync.getRepository(CampanhaPerguntas);
    const campanhaRepository = AppDataSourceSync.getRepository(Campanha);
    
    // Validate that the campanha exists if ID_CAMPANHA is provided
    if (perguntaData.ID_CAMPANHA) {
      const campanhaExists = await campanhaRepository.findOne({
        where: { ID_CAMPANHA: perguntaData.ID_CAMPANHA }
      });
      
      if (!campanhaExists) {
        throw new Error("Campanha não encontrada.");
      }
    }
    
    const novaPergunta = perguntaRepository.create(perguntaData);
    const perguntaSalva = await perguntaRepository.save(novaPergunta);
    
    return perguntaSalva;
  }

  /**
   * Updates an existing campanha pergunta in the database
   * @param id - The pergunta ID to update
   * @param perguntaData - The pergunta data to update
   * @returns The updated pergunta or null if not found
   */
  static async updateCampanhaPergunta(id: number, perguntaData: Partial<CampanhaPerguntas>): Promise<CampanhaPerguntas | null> {
    const perguntaRepository = AppDataSourceSync.getRepository(CampanhaPerguntas);
    const campanhaRepository = AppDataSourceSync.getRepository(Campanha);
    
    // Find the pergunta by ID
    const perguntaExistente = await perguntaRepository.findOne({
      where: { ID_PERGUNTAS: id }
    });

    if (!perguntaExistente) {
      return null;
    }

    // Validate that the campanha exists if ID_CAMPANHA is being updated
    if (perguntaData.ID_CAMPANHA) {
      const campanhaExists = await campanhaRepository.findOne({
        where: { ID_CAMPANHA: perguntaData.ID_CAMPANHA }
      });
      
      if (!campanhaExists) {
        throw new Error("Campanha não encontrada.");
      }
    }

    // Update the pergunta fields
    Object.assign(perguntaExistente, perguntaData);
    
    const perguntaAtualizada = await perguntaRepository.save(perguntaExistente);
    
    return perguntaAtualizada;
  }

  /**
   * Soft deletes a campanha pergunta by ID
   * @param id - The pergunta ID to delete
   * @returns The deleted pergunta or null if not found
   */
  static async deleteCampanhaPergunta(id: number): Promise<CampanhaPerguntas | null> {
    const perguntaRepository = AppDataSourceSync.getRepository(CampanhaPerguntas);
    
    // Find the pergunta by ID
    const perguntaExistente = await perguntaRepository.findOne({
      where: { ID_PERGUNTAS: id }
    });

    if (!perguntaExistente) {
      return null;
    }

    // Soft delete the pergunta
    await perguntaRepository.softDelete(id);
    
    return perguntaExistente;
  }

  /**
   * Finds a campanha pergunta by ID
   * @param id - The pergunta ID to find
   * @returns The pergunta or null if not found
   */
  static async findCampanhaPerguntaById(id: number): Promise<CampanhaPerguntas | null> {
    const perguntaRepository = AppDataSourceSync.getRepository(CampanhaPerguntas);
    
    const pergunta = await perguntaRepository.findOne({
      where: { ID_PERGUNTAS: id }
    });

    return pergunta;
  }

  /**
   * Gets all campanha perguntas (non-deleted)
   * @returns Array of all perguntas
   */
  static async getAllCampanhaPerguntas(): Promise<CampanhaPerguntas[]> {
    const perguntaRepository = AppDataSourceSync.getRepository(CampanhaPerguntas);
    
    const perguntas = await perguntaRepository.find({
      relations: ['campanha'],
      order: {
        CREATED_AT: 'DESC',
      },
    });

    return perguntas;
  }

  /**
   * Gets all perguntas for a specific campanha
   * @param campanhaId - The campanha ID
   * @returns Array of perguntas for the campanha
   */
  static async getPerguntasByCampanhaId(campanhaId: number): Promise<CampanhaPerguntas[]> {
    const perguntaRepository = AppDataSourceSync.getRepository(CampanhaPerguntas);
    
    const perguntas = await perguntaRepository.find({
      where: { ID_CAMPANHA: campanhaId },
      order: {
        CREATED_AT: 'ASC',
      },
    });

    return perguntas;
  }
}
