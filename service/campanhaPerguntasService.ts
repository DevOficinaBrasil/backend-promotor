import { AppDataSourceSync } from "../data-source";
import CampanhaPerguntas from "../entities/CampanhaPerguntas";
import CampanhaPerguntaOpcao from "../entities/CampanhaPerguntaOpcao";
import Campanha from "../entities/Campanha";

export default class CampanhaPerguntasService {
  /**
   * Creates a new campanha pergunta in the database
   * @param perguntaData - The pergunta data to create
   * @param opcoes - Array of options (for Multi type)
   * @returns The created pergunta
   */
  static async createCampanhaPergunta(
    perguntaData: Partial<CampanhaPerguntas>,
    opcoes?: { LABEL: string; ORDEM: number }[]
  ): Promise<CampanhaPerguntas> {
    const perguntaRepository = AppDataSourceSync.getRepository(CampanhaPerguntas);
    const opcaoRepository = AppDataSourceSync.getRepository(CampanhaPerguntaOpcao);
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
    
    // Save opcoes if tipo is Multi
    if (opcoes && opcoes.length > 0 && perguntaSalva.ID_PERGUNTAS) {
      const opcaoEntities = opcoes.map((o) =>
        opcaoRepository.create({
          ID_PERGUNTAS: perguntaSalva.ID_PERGUNTAS!,
          LABEL: o.LABEL,
          ORDEM: o.ORDEM,
        })
      );
      perguntaSalva.opcoes = await opcaoRepository.save(opcaoEntities);
    }

    return perguntaSalva;
  }

  /**
   * Updates an existing campanha pergunta in the database
   * @param id - The pergunta ID to update
   * @param perguntaData - The pergunta data to update
   * @param opcoes - Array of options (for Multi type) — replaces all existing
   * @returns The updated pergunta or null if not found
   */
  static async updateCampanhaPergunta(
    id: number,
    perguntaData: Partial<CampanhaPerguntas>,
    opcoes?: { LABEL: string; ORDEM: number }[]
  ): Promise<CampanhaPerguntas | null> {
    const perguntaRepository = AppDataSourceSync.getRepository(CampanhaPerguntas);
    const opcaoRepository = AppDataSourceSync.getRepository(CampanhaPerguntaOpcao);
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

    // Replace opcoes if provided (full replace strategy)
    if (opcoes !== undefined) {
      // Soft-delete existing opcoes
      await opcaoRepository.softDelete({ ID_PERGUNTAS: id });

      if (opcoes.length > 0) {
        const opcaoEntities = opcoes.map((o) =>
          opcaoRepository.create({
            ID_PERGUNTAS: id,
            LABEL: o.LABEL,
            ORDEM: o.ORDEM,
          })
        );
        perguntaAtualizada.opcoes = await opcaoRepository.save(opcaoEntities);
      } else {
        perguntaAtualizada.opcoes = [];
      }
    }
    
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
      where: { ID_PERGUNTAS: id },
      relations: ['opcoes'],
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
      relations: ['campanha', 'opcoes'],
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
      relations: ['opcoes'],
      order: {
        CREATED_AT: 'ASC',
      },
    });

    return perguntas;
  }
}
