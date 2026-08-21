import { AppDataSourceSync } from "../data-source";
import CampanhaPerguntas from "../entities/CampanhaPerguntas";
import CampanhaPerguntaOpcao from "../entities/CampanhaPerguntaOpcao";
import Campanha from "../entities/Campanha";

export default class CampanhaPerguntasService {
  private static getPerguntaRepo() {
    return AppDataSourceSync.getRepository(CampanhaPerguntas);
  }

  private static getOpcaoRepo() {
    return AppDataSourceSync.getRepository(CampanhaPerguntaOpcao);
  }

  private static getCampanhaRepo() {
    return AppDataSourceSync.getRepository(Campanha);
  }

  /**
   * Creates a new campanha pergunta in the database
   */
  static async createCampanhaPergunta(
    perguntaData: Partial<CampanhaPerguntas>,
    opcoes?: { LABEL: string; ORDEM: number }[]
  ): Promise<CampanhaPerguntas> {
    const perguntaRepo = this.getPerguntaRepo();
    const opcaoRepo = this.getOpcaoRepo();
    const campanhaRepo = this.getCampanhaRepo();
    
    // Validate that the campanha exists if ID_CAMPANHA is provided
    if (perguntaData.ID_CAMPANHA) {
      const campanhaExists = await campanhaRepo.findOne({
        where: { ID_CAMPANHA: perguntaData.ID_CAMPANHA }
      });
      
      if (!campanhaExists) {
        throw new Error("Campanha não encontrada.");
      }
    }
    
    const novaPergunta = perguntaRepo.create(perguntaData);
    const perguntaSalva = await perguntaRepo.save(novaPergunta);
    
    // Save opcoes if tipo is Multi
    if (opcoes && opcoes.length > 0 && perguntaSalva.ID_PERGUNTAS) {
      const opcaoEntities = opcoes.map((o) =>
        opcaoRepo.create({
          ID_PERGUNTAS: perguntaSalva.ID_PERGUNTAS!,
          LABEL: o.LABEL,
          ORDEM: o.ORDEM,
        })
      );
      perguntaSalva.opcoes = await opcaoRepo.save(opcaoEntities);
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
    const perguntaRepo = this.getPerguntaRepo();
    const opcaoRepo = this.getOpcaoRepo();
    const campanhaRepo = this.getCampanhaRepo();
    
    // Find the pergunta by ID (searches both DBs)
    const perguntaExistente = await perguntaRepo.findOne({
      where: { ID_PERGUNTAS: id }
    });

    if (!perguntaExistente) {
      return null;
    }

    // Validate that the campanha exists if ID_CAMPANHA is being updated
    if (perguntaData.ID_CAMPANHA) {
      const campanhaExists = await campanhaRepo.findOne({
        where: { ID_CAMPANHA: perguntaData.ID_CAMPANHA }
      });
      
      if (!campanhaExists) {
        throw new Error("Campanha não encontrada.");
      }
    }

    // Update the pergunta fields
    Object.assign(perguntaExistente, perguntaData);
    
    const perguntaAtualizada = await perguntaRepo.save(perguntaExistente);

    // Replace opcoes if provided (full replace strategy)
    if (opcoes !== undefined) {
      // Soft-delete existing opcoes (on new DB)
      await opcaoRepo.softDelete({ ID_PERGUNTAS: id } as any);

      if (opcoes.length > 0) {
        const opcaoEntities = opcoes.map((o) =>
          opcaoRepo.create({
            ID_PERGUNTAS: id,
            LABEL: o.LABEL,
            ORDEM: o.ORDEM,
          })
        );
        perguntaAtualizada.opcoes = await opcaoRepo.save(opcaoEntities);
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
    const perguntaRepo = this.getPerguntaRepo();
    
    // Find the pergunta by ID (searches both DBs)
    const perguntaExistente = await perguntaRepo.findOne({
      where: { ID_PERGUNTAS: id }
    });

    if (!perguntaExistente) {
      return null;
    }

    // Soft delete the pergunta (on new DB)
    await perguntaRepo.softDelete(id);
    
    return perguntaExistente;
  }

  /**
   * Finds a campanha pergunta by ID
   */
  static async findCampanhaPerguntaById(id: number): Promise<CampanhaPerguntas | null> {
    const perguntaRepo = this.getPerguntaRepo();
    
    const pergunta = await perguntaRepo.findOne({
      where: { ID_PERGUNTAS: id },
      relations: ['opcoes'],
    });

    return pergunta;
  }

  /**
   * Gets all campanha perguntas (non-deleted)
   */
  static async getAllCampanhaPerguntas(): Promise<CampanhaPerguntas[]> {
    const perguntaRepo = this.getPerguntaRepo();
    
    const perguntas = await perguntaRepo.find({
      relations: ['campanha', 'opcoes'],
      order: {
        CREATED_AT: 'DESC',
      },
    });

    return perguntas;
  }

  /**
   * Gets all perguntas for a specific campanha
   */
  static async getPerguntasByCampanhaId(campanhaId: number): Promise<CampanhaPerguntas[]> {
    const perguntaRepo = this.getPerguntaRepo();
    
    const perguntas = await perguntaRepo.find({
      where: { ID_CAMPANHA: campanhaId },
      relations: ['opcoes'],
      order: {
        CREATED_AT: 'ASC',
      },
    });

    return perguntas;
  }
}
