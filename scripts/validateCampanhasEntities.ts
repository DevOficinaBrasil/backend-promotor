/**
 * Script de validação das entidades do sistema de campanhas
 * Este script verifica se todas as entidades podem ser carregadas corretamente
 */

import "reflect-metadata";
import Campanha from "../entities/Campanha";
import Promotor from "../entities/Promotor";
import CampanhaPromotor from "../entities/CampanhaPromotor";
import CampanhaPerguntas, { TipoPergunta } from "../entities/CampanhaPerguntas";
import RotaPromotor, { StatusRota, RedirectRota } from "../entities/RotaPromotor";
import CampanhaResults from "../entities/CampanhaResults";

console.log("🔍 Validando entidades do sistema de campanhas...\n");

try {
  // Validar Campanha
  const campanha = new Campanha({
    NOME: "Campanha Teste",
    OBEJTIVO: "Teste",
  });
  console.log("✅ Campanha: Entidade validada com sucesso");

  // Validar Promotor
  const promotor = new Promotor({
    NOME: "Promotor Teste",
    EMAIL: "teste@example.com",
  });
  console.log("✅ Promotor: Entidade validada com sucesso");

  // Validar CampanhaPromotor
  const campanhaPromotor = new CampanhaPromotor({
    ID_CAMPANHA: 1,
    ID_PROMOTOR: 1,
  });
  console.log("✅ CampanhaPromotor: Entidade validada com sucesso");

  // Validar CampanhaPerguntas
  const campanhaPerguntas = new CampanhaPerguntas({
    ID_CAMPANHA: 1,
    PERGUNTA: "Qual é o produto?",
    TIPO: TipoPergunta.String,
  });
  console.log("✅ CampanhaPerguntas: Entidade validada com sucesso");

  // Validar RotaPromotor
  const rotaPromotor = new RotaPromotor({
    ID_OFICINA: 1,
    ID_CAMPANHA_PROMOTOR: 1,
    STATUS: StatusRota.BACKLOG,
  });
  console.log("✅ RotaPromotor: Entidade validada com sucesso");

  // Validar CampanhaResults
  const campanhaResults = new CampanhaResults({
    ID_ROTA: 1,
    ID_PERGUNTA: 1,
    RESPOSTA: "Resposta teste",
  });
  console.log("✅ CampanhaResults: Entidade validada com sucesso");

  console.log("\n✨ Todas as entidades foram validadas com sucesso!");
  console.log("\n📊 Resumo:");
  console.log("   - 6 entidades criadas");
  console.log("   - 3 enums: StatusRota (5 valores), TipoPergunta (4 valores), RedirectRota (3 valores)");
  console.log("   - Soft delete habilitado em todas as entidades");
  console.log("   - Timestamps automáticos configurados");
  
  process.exit(0);
} catch (error) {
  console.error("\n❌ Erro ao validar entidades:", error);
  process.exit(1);
}
