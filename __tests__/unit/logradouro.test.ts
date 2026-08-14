import { dividirLogradouro, TIPOS_LOGRADOURO } from '../../utils/logradouro';

// Spec: VISIB-11 — P1 "O endereço corrigido chega a quem dirige até lá", AC3/AC4.
// AC3: primeiro token casa com tipo conhecido -> token em `logradouro`, restante em `rua`.
// AC4: não casa -> `logradouro = null` e a string inteira em `rua`.
// Edge cases da spec: uma palavra só, string vazia / só espaços / null caem no
// fallback e gravam em `rua` o mesmo valor que já vai para OFICINA.ENDERECO.
describe('dividirLogradouro', () => {
  describe('AC3 — primeiro token corresponde a um tipo de logradouro conhecido', () => {
    it('separa "Rua das Flores" em tipo e nome', () => {
      expect(dividirLogradouro('Rua das Flores')).toEqual({
        logradouro: 'Rua',
        rua: 'das Flores',
      });
    });

    it('separa "Avenida Nova"', () => {
      expect(dividirLogradouro('Avenida Nova')).toEqual({
        logradouro: 'Avenida',
        rua: 'Nova',
      });
    });

    it('separa "Rodovia BR-101"', () => {
      expect(dividirLogradouro('Rodovia BR-101')).toEqual({
        logradouro: 'Rodovia',
        rua: 'BR-101',
      });
    });

    it('separa "Estrada do Coco"', () => {
      expect(dividirLogradouro('Estrada do Coco')).toEqual({
        logradouro: 'Estrada',
        rua: 'do Coco',
      });
    });

    it('separa "Travessa Pedro Alves"', () => {
      expect(dividirLogradouro('Travessa Pedro Alves')).toEqual({
        logradouro: 'Travessa',
        rua: 'Pedro Alves',
      });
    });

    it('separa "Alameda Santos"', () => {
      expect(dividirLogradouro('Alameda Santos')).toEqual({
        logradouro: 'Alameda',
        rua: 'Santos',
      });
    });

    it('separa "Praça da Sé" preservando o acento no tipo', () => {
      expect(dividirLogradouro('Praça da Sé')).toEqual({
        logradouro: 'Praça',
        rua: 'da Sé',
      });
    });

    it('separa "Quadra 12 Lote 3"', () => {
      expect(dividirLogradouro('Quadra 12 Lote 3')).toEqual({
        logradouro: 'Quadra',
        rua: '12 Lote 3',
      });
    });

    it('reconhece os 8 tipos declarados em TIPOS_LOGRADOURO', () => {
      expect([...TIPOS_LOGRADOURO]).toEqual([
        'rua',
        'avenida',
        'rodovia',
        'estrada',
        'travessa',
        'alameda',
        'praça',
        'quadra',
      ]);
    });

    it('casa sem acento e sem diferenciar maiúsculas ("PRACA da Se")', () => {
      expect(dividirLogradouro('PRACA da Se')).toEqual({
        logradouro: 'PRACA',
        rua: 'da Se',
      });
    });

    it('aplica trim ao restante quando há espaços extras em volta', () => {
      expect(dividirLogradouro('  Rua   das Flores  ')).toEqual({
        logradouro: 'Rua',
        rua: 'das Flores',
      });
    });
  });

  describe('AC4 e edge cases — fallback', () => {
    it('joga a string inteira em rua quando o primeiro token não é um tipo conhecido', () => {
      expect(dividirLogradouro('Chacara do Ze')).toEqual({
        logradouro: null,
        rua: 'Chacara do Ze',
      });
    });

    it('trata string de uma palavra só como nome, sem gravar rua vazia', () => {
      expect(dividirLogradouro('Rua')).toEqual({
        logradouro: null,
        rua: 'Rua',
      });
    });

    it('devolve rua vazia para string vazia — mesmo valor gravado em OFICINA.ENDERECO', () => {
      expect(dividirLogradouro('')).toEqual({ logradouro: null, rua: '' });
    });

    it('devolve rua null para endereco null', () => {
      expect(dividirLogradouro(null)).toEqual({ logradouro: null, rua: null });
    });

    it('devolve a string intacta quando ela só tem espaços', () => {
      expect(dividirLogradouro('   ')).toEqual({ logradouro: null, rua: '   ' });
    });
  });
});
