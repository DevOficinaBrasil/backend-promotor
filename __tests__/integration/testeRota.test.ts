import request from 'supertest';
import app from '../../app';

/**
 * Integration test for teste-rota health check endpoint
 */
describe('TesteRota Health Check', () => {
  it('should return health check status on GET /teste-rota', async () => {
    const response = await request(app)
      .get('/teste-rota')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('status');
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body.status).toBe('ok');
    expect(response.body.message).toBe('Teste-rota health check passed');
  });

  it('should return a valid ISO timestamp', async () => {
    const response = await request(app)
      .get('/teste-rota')
      .expect(200);

    const timestamp = response.body.timestamp;
    expect(timestamp).toBeDefined();
    
    // Verify it's a valid date
    const date = new Date(timestamp);
    expect(date.toString()).not.toBe('Invalid Date');
  });
});
