/**
 * Shared types for Cloudflare Worker
 */

export interface Env {
  ENVIRONMENT: string;
  GEMINI_API_KEY: string;
  CF_IMAGES_TOKEN: string;
  CF_ACCOUNT_ID: string;
  DB: D1Database;
  AI_ARCHITECT: Fetcher;
}
