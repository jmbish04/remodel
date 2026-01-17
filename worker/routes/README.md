# API Routes

Modular route handlers organized by domain.

## Structure

Each route module exports a Hono router instance that handles a specific domain:

- **health.routes.ts** - Health check endpoint
- **projects.routes.ts** - Project CRUD operations
- **floors.routes.ts** - Floor creation and calibration sync
- **rooms.routes.ts** - Room creation and updates
- **images.routes.ts** - Image upload to Cloudflare Images CDN
- **visuals.routes.ts** - AI visual generation via Gemini
- **logs.routes.ts** - Agent audit log management
- **snapshots.routes.ts** - Floor plan version snapshots

## Usage

Routes are mounted in `worker/index.ts`:

```typescript
app.route('/api/projects', projectsRoutes);
app.route('/api/floors', floorsRoutes);
// ...etc
```

## Adding New Routes

1. Create a new file: `worker/routes/[domain].routes.ts`
2. Export a Hono router instance with typed environment bindings
3. Import and mount in `worker/index.ts`

Example:

```typescript
import { Hono } from 'hono';
import type { Env } from '../types';

const myRouter = new Hono<{ Bindings: Env }>();

myRouter.get('/', async (c) => {
  return c.json({ message: 'Hello' });
});

export default myRouter;
```
