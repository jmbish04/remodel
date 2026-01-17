/**
 * Cloudflare Worker proxy for Ultimate AI Architect container
 * This worker routes requests to the Next.js container running on Cloudflare Containers
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

      // Pass API key to container via header (for server-side API calls)
      containerRequest.headers.set('X-Gemini-API-Key', env.GEMINI_API_KEY || '');

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
