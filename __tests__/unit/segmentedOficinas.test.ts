import OficinaService from '../../service/oficinaService';
import { AppDataSourceSync } from '../../data-source';

jest.mock('../../data-source');

describe('OficinaService - getSegmentedNearbyOficinas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty array when no externalUserIds', async () => {
    const result = await OficinaService.getSegmentedNearbyOficinas(-23.55, -46.63, 20, []);

    expect(result).toEqual([]);
    expect(AppDataSourceSync.query).not.toHaveBeenCalled();
  });

  it('should query oficinas by user IDs with Haversine filter', async () => {
    const mockOficinas = [
      { ID_OFICINA: 101, NOME_FANTASIA: 'Oficina A', distance: 5.2 },
      { ID_OFICINA: 202, NOME_FANTASIA: 'Oficina B', distance: 12.1 },
    ];
    (AppDataSourceSync.query as jest.Mock).mockResolvedValue(mockOficinas);

    const result = await OficinaService.getSegmentedNearbyOficinas(
      -23.55, -46.63, 20, [305623, 363474]
    );

    expect(result).toHaveLength(2);
    expect(result[0].ID_OFICINA).toBe(101);

    const [sql, params] = (AppDataSourceSync.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('USUARIO');
    expect(sql).toContain('cadastro_empresa');
    expect(sql).toContain('ID_USUARIO');
    // params: lat, lon, raio, ...userIds
    expect(params[0]).toBe(-23.55);
    expect(params[1]).toBe(-46.63);
    expect(params[2]).toBe(20);
    expect(params.slice(3)).toEqual([305623, 363474]);
  });

  it('should batch IDs in chunks of 1000', async () => {
    const ids = Array.from({ length: 2500 }, (_, i) => i + 1);
    (AppDataSourceSync.query as jest.Mock).mockResolvedValue([
      { ID_OFICINA: 1, distance: 5 },
    ]);

    await OficinaService.getSegmentedNearbyOficinas(-23.55, -46.63, 20, ids);

    // 2500 IDs / 1000 = 3 batches
    expect(AppDataSourceSync.query).toHaveBeenCalledTimes(3);

    // First batch: 1000 IDs
    const firstParams = (AppDataSourceSync.query as jest.Mock).mock.calls[0][1];
    expect(firstParams.length).toBe(3 + 1000); // lat, lon, raio + 1000 ids

    // Third batch: 500 IDs
    const thirdParams = (AppDataSourceSync.query as jest.Mock).mock.calls[2][1];
    expect(thirdParams.length).toBe(3 + 500);
  });

  it('should deduplicate oficinas across batches', async () => {
    const ids = Array.from({ length: 1500 }, (_, i) => i + 1);
    // Both batches return the same oficina
    (AppDataSourceSync.query as jest.Mock)
      .mockResolvedValueOnce([{ ID_OFICINA: 101, distance: 5 }])
      .mockResolvedValueOnce([{ ID_OFICINA: 101, distance: 5 }, { ID_OFICINA: 202, distance: 10 }]);

    const result = await OficinaService.getSegmentedNearbyOficinas(-23.55, -46.63, 20, ids);

    expect(result).toHaveLength(2);
    expect(result.map((r: any) => r.ID_OFICINA)).toEqual([101, 202]);
  });

  it('should rethrow database errors', async () => {
    (AppDataSourceSync.query as jest.Mock).mockRejectedValue(new Error('DB error'));

    await expect(
      OficinaService.getSegmentedNearbyOficinas(-23.55, -46.63, 20, [1])
    ).rejects.toThrow('DB error');
  });
});
