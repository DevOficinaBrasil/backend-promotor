import SegmentacaoService from '../../service/segmentacaoService';
import { AppDataSourceSync } from '../../data-source';
import { SegmentValidator } from '@obcrm/segmentation';

jest.mock('../../data-source');
jest.mock('@obcrm/segmentation', () => ({
  SegmentValidator: jest.fn().mockImplementation(() => ({
    validateDefinition: jest.fn(),
  })),
  previewSegmentDefinition: jest.fn(),
  listSegmentFilterOptions: jest.fn(),
}));

describe('SegmentacaoService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validDsl = {
    if: { behavior: { section: 'LEAD_DATA', criterion: 'LEAD_FIELD', value: { fieldKey: 'gender', fieldType: 'text', operator: 'EQUALS', value: 'Masculino' } } },
    then: { decision: 'include', reason: 'matched' },
    default: { decision: 'exclude', reason: 'default' },
  };

  describe('validateDsl', () => {
    it('should return valid when definition passes validation', () => {
      const mockValidate = jest.fn().mockReturnValue({ valid: true, errorArray: [] });
      (SegmentValidator as jest.Mock).mockImplementation(() => ({
        validateDefinition: mockValidate,
      }));

      const result = SegmentacaoService.validateDsl(validDsl);

      expect(result).toEqual({ valid: true });
      expect(mockValidate).toHaveBeenCalledWith('dynamic', validDsl);
    });

    it('should return errors when definition is invalid', () => {
      const mockValidate = jest.fn().mockReturnValue({
        valid: false,
        errorArray: ['if.behavior is invalid'],
      });
      (SegmentValidator as jest.Mock).mockImplementation(() => ({
        validateDefinition: mockValidate,
      }));

      const result = SegmentacaoService.validateDsl({ bad: true });

      expect(result).toEqual({ valid: false, errors: ['if.behavior is invalid'] });
    });
  });

  describe('resolveTenantId', () => {
    it('should return CommunityID for valid slug', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([{ CommunityID: 35 }]);

      const result = await SegmentacaoService.resolveTenantId('minha-empresa');

      expect(result).toBe(35);
      expect(AppDataSourceSync.query).toHaveBeenCalledWith(
        expect.stringContaining('EmpresaSlug'),
        ['minha-empresa']
      );
    });

    it('should return null when slug not found', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      const result = await SegmentacaoService.resolveTenantId('nao-existe');

      expect(result).toBeNull();
    });
  });

  describe('resolveTenantIdByCampanha', () => {
    it('should return CommunityID for valid campaign', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([{ CommunityID: 42 }]);

      const result = await SegmentacaoService.resolveTenantIdByCampanha(123);

      expect(result).toBe(42);
      expect(AppDataSourceSync.query).toHaveBeenCalledWith(
        expect.stringContaining('ID_CAMPANHA'),
        [123]
      );
    });

    it('should return null when campaign has no EMPRESA_SLUG', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      const result = await SegmentacaoService.resolveTenantIdByCampanha(999);

      expect(result).toBeNull();
    });
  });

  describe('previewContacts', () => {
    it('should extract externalUserIds from CRM response', async () => {
      const { previewSegmentDefinition } = require('@obcrm/segmentation');
      (previewSegmentDefinition as jest.Mock).mockResolvedValue({
        sampleArray: [
          { external_user_id: '305623', fullName: 'João' },
          { external_user_id: '363474', fullName: 'Maria' },
        ],
        estimatedCount: 2,
        hasMore: false,
      });

      const result = await SegmentacaoService.previewContacts(validDsl, 35, 100);

      expect(result.externalUserIds).toEqual([305623, 363474]);
      expect(result.estimatedCount).toBe(2);
      expect(result.hasMore).toBe(false);
      expect(result.sampleArray).toHaveLength(2);
    });

    it('should filter out non-numeric external_user_ids', async () => {
      const { previewSegmentDefinition } = require('@obcrm/segmentation');
      (previewSegmentDefinition as jest.Mock).mockResolvedValue({
        sampleArray: [
          { external_user_id: '305623' },
          { external_user_id: 'invalid' },
          { external_user_id: '' },
        ],
        estimatedCount: 3,
        hasMore: false,
      });

      const result = await SegmentacaoService.previewContacts(validDsl, 35, 100);

      expect(result.externalUserIds).toEqual([305623]);
    });

    it('should return empty array when CRM returns no contacts', async () => {
      const { previewSegmentDefinition } = require('@obcrm/segmentation');
      (previewSegmentDefinition as jest.Mock).mockResolvedValue({
        sampleArray: [],
        estimatedCount: 0,
        hasMore: false,
      });

      const result = await SegmentacaoService.previewContacts(validDsl, 35, 100);

      expect(result.externalUserIds).toEqual([]);
      expect(result.estimatedCount).toBe(0);
    });

    it('should default estimatedCount to 0 when undefined', async () => {
      const { previewSegmentDefinition } = require('@obcrm/segmentation');
      (previewSegmentDefinition as jest.Mock).mockResolvedValue({
        sampleArray: [],
        hasMore: false,
      });

      const result = await SegmentacaoService.previewContacts(validDsl, 35, 100);

      expect(result.estimatedCount).toBe(0);
    });
  });

  // T17 (CONV-12): a leitura de valores recebe o tenant, para a tela de admin
  // consultar o tenant 15 com a mesma regra da rota por campanha.
  describe('valoresDeCampo', () => {
    const normalizarSql = (sql: string) => sql.replace(/\s+/g, ' ').trim();

    it('filtra CRM.contact_attribute pelo tenant informado e pela chave do atributo', async () => {
      const valores = [{ valor: 'Masculino', contatos: 3 }];
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue(valores);

      const result = await SegmentacaoService.valoresDeCampo(15, 'contactAttributes.gender');

      expect(result).toEqual(valores);
      const [sql, params] = (AppDataSourceSync.query as jest.Mock).mock.calls[0];
      expect(normalizarSql(sql)).toContain(
        'FROM "CRM"."contact_attribute" ca INNER JOIN "CRM"."contact" ct ON ct."id" = ca."contact_id" WHERE ct."tenant_id" = $1 AND ca."attribute_key" = $2'
      );
      expect(params).toEqual([15, 'gender']);
    });

    it('campo core da oficina: junta contato → USUARIO → OFICINA no tenant informado', async () => {
      (AppDataSourceSync.query as jest.Mock).mockResolvedValue([]);

      await SegmentacaoService.valoresDeCampo(15, 'oficina.ESTADO');

      const [sql, params] = (AppDataSourceSync.query as jest.Mock).mock.calls[0];
      expect(normalizarSql(sql)).toContain(
        'INNER JOIN "MAIN_REGISTER"."USUARIO" us ON us."ID_USUARIO" = ct."external_user_id" INNER JOIN "MAIN_REGISTER"."OFICINA" o ON o."ID_OFICINA" = us."ID_OFICINA" WHERE ct."tenant_id" = $1'
      );
      expect(params).toEqual([15]);
    });

    it('tag e path core fora da lista devolvem vazio sem consultar', async () => {
      await expect(SegmentacaoService.valoresDeCampo(15, 'contactTagByNameMap.vip')).resolves.toEqual([]);
      await expect(SegmentacaoService.valoresDeCampo(15, 'oficina.SENHA')).resolves.toEqual([]);
      expect(AppDataSourceSync.query).not.toHaveBeenCalled();
    });
  });
});
