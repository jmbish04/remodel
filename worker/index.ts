/**
 * Cloudflare Worker - Hono API Gateway + Next.js Container Proxy
 *
 * Architecture:
 * - /api/* → Hono routes (REST API for D1, Cloudflare Images, Gemini AI)
 * - /* → Next.js container (frontend application)
 */

import app from './app';
import { RemodelApp } from './container';

export { RemodelApp };
export default app;
