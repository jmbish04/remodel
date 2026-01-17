/**
 * Cloudflare Worker proxy for Ultimate AI Architect container
 * This worker routes requests to the Next.js container running on Cloudflare Containers
 * 
 * The GEMINI_API_KEY is passed to the container as an environment variable during deployment.
 * Configure this in your wrangler.jsonc or via `wrangler secret put GEMINI_API_KEY`
 */

export interface Env {
  ENVIRONMENT: string;
  GEMINI_API_KEY: string;
  AI_ARCHITECT: Fetcher; // Container binding
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', environment: env.ENVIRONMENT }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Forward all requests to the container
    // The container binding automatically routes to the running container
    try {
      const containerRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      const response = await env.AI_ARCHITECT.fetch(containerRequest);
      return response;
    } catch (error) {
      console.error('Container fetch error:', error);
      return new Response(JSON.stringify({ error: 'Container unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
