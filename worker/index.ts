/**
 * Cloudflare Worker - Hono API Gateway + Next.js Container Proxy
 *
 * Architecture:
 * - /api/* → Hono routes (REST API for D1, Cloudflare Images, Gemini AI)
 * - /* → Next.js container (frontend application)
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import healthRoutes from './routes/health.routes';
import projectsRoutes from './routes/projects.routes';
import floorsRoutes from './routes/floors.routes';
import roomsRoutes from './routes/rooms.routes';
import imagesRoutes from './routes/images.routes';
import visualsRoutes from './routes/visuals.routes';
import logsRoutes from './routes/logs.routes';
import snapshotsRoutes from './routes/snapshots.routes';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all API endpoints
app.use('/api/*', cors());

// Mount route modules
app.route('/health', healthRoutes);
app.route('/api/projects', projectsRoutes);
app.route('/api/floors', floorsRoutes);
app.route('/api/rooms', roomsRoutes);
app.route('/api/images', imagesRoutes);
app.route('/api/generate', visualsRoutes);
app.route('/api/logs', logsRoutes);
app.route('/api/snapshots', snapshotsRoutes);

// Container Proxy - Forwards all non-API traffic to Next.js frontend
app.all('*', async (c) => {
  try {
    const containerRequest = new Request(c.req.url, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.raw.body,
    });

    const response = await c.env.AI_ARCHITECT.fetch(containerRequest);

    return response;
  } catch (error) {
    console.error('Container fetch error:', error);
    return c.json(
      {
        error: 'Container unavailable',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      503
    );
  }
});

export default app;
