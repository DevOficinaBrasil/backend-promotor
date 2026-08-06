import GeolocationService from '../../service/geolocationService';

const originalFetch = global.fetch;

// Bypass the 1s Nominatim throttle in tests
jest.spyOn(global, 'setTimeout').mockImplementation((fn: Function) => {
  fn();
  return 0 as unknown as NodeJS.Timeout;
});

describe('GeolocationService', () => {
  let service: GeolocationService;

  beforeEach(() => {
    service = new GeolocationService();
    global.fetch = jest.fn();
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('getLatLongByCep', () => {
    it('should return coordinates via Nominatim', async () => {
      // ViaCEP response
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            logradouro: 'Rua X', bairro: 'Centro', localidade: 'São Paulo', uf: 'SP',
          }),
        })
        // Nominatim response
        .mockResolvedValueOnce({
          json: () => Promise.resolve([{ lat: '-23.55', lon: '-46.63' }]),
        });

      const result = await service.getLatLongByCep('01001-000');

      expect(result).toEqual({ lat: -23.55, long: -46.63 });
    });

    it('should fallback to Google Maps when Nominatim fails', async () => {
      process.env.GOOGLE_API_KEY = 'test-key';

      // ViaCEP
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            logradouro: 'Rua X', bairro: 'Centro', localidade: 'SP', uf: 'SP',
          }),
        })
        // Nominatim with bairro: empty
        .mockResolvedValueOnce({ json: () => Promise.resolve([]) })
        // Nominatim without bairro: empty
        .mockResolvedValueOnce({ json: () => Promise.resolve([]) })
        // Google Maps
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'OK',
            results: [{ geometry: { location: { lat: -23.55, lng: -46.63 } } }],
          }),
        });

      const result = await service.getLatLongByCep('01001-000');

      expect(result).toEqual({ lat: -23.55, long: -46.63 });

      delete process.env.GOOGLE_API_KEY;
    });

    it('should return null when both services fail', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await service.getLatLongByCep('00000-000');

      expect(result).toBeNull();
    });

    it('should return null when ViaCEP returns error', async () => {
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ erro: true }),
        })
        // Google fallback - no API key
        .mockRejectedValueOnce(new Error('fail'));

      delete process.env.GOOGLE_API_KEY;

      const result = await service.getLatLongByCep('99999-999');

      expect(result).toBeNull();
    });
  });
});
