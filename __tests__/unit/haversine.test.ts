import { haversineDistanceKm } from '../../utils/haversine';

describe('haversineDistanceKm', () => {
  it('should return 0 for identical coordinates', () => {
    expect(haversineDistanceKm(-23.55, -46.63, -23.55, -46.63)).toBe(0);
  });

  it('should calculate São Paulo ↔ Curitiba (~338km)', () => {
    const dist = haversineDistanceKm(-23.5505, -46.6333, -25.4284, -49.2733);
    expect(dist).toBeGreaterThan(330);
    expect(dist).toBeLessThan(345);
  });

  it('should calculate São Paulo ↔ Rio de Janeiro (~357km)', () => {
    const dist = haversineDistanceKm(-23.5505, -46.6333, -22.9068, -43.1729);
    expect(dist).toBeGreaterThan(350);
    expect(dist).toBeLessThan(365);
  });

  it('should be symmetric (A→B == B→A)', () => {
    const ab = haversineDistanceKm(-23.55, -46.63, -25.43, -49.27);
    const ba = haversineDistanceKm(-25.43, -49.27, -23.55, -46.63);
    expect(ab).toBeCloseTo(ba, 10);
  });

  it('should handle antipodal points (~20015km)', () => {
    const dist = haversineDistanceKm(0, 0, 0, 180);
    expect(dist).toBeGreaterThan(20000);
    expect(dist).toBeLessThan(20100);
  });

  it('should handle small distances (<1km)', () => {
    // ~0.1km apart
    const dist = haversineDistanceKm(-23.5505, -46.6333, -23.5510, -46.6340);
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThan(1);
  });
});
