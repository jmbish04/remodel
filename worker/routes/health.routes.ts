/**
 * Health check routes
 */

import { Hono } from 'hono';

const health = new Hono<{ Bindings: Env }>();

health.get('/', (c) => {
  return c.json({
    status: 'ok',
    environment: 'production',
    timestamp: new Date().toISOString(),
  });
});

export default health;
