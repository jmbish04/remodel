# Smart Home Remodeler - Production Edition

A database-backed AI-powered home remodeling application running on Cloudflare's edge infrastructure.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Worker                            │
│  ┌───────────────────────┐    ┌────────────────────────────┐   │
│  │   Hono API Gateway    │    │   Container Proxy          │   │
│  │   /api/*              │    │   /* (Next.js Frontend)    │   │
│  └───────┬───────────────┘    └────────────────────────────┘   │
└──────────┼──────────────────────────────────────────────────────┘
           │
           ├─► D1 Database (SQLite)
           │   ├─ projects
           │   ├─ floors
           │   ├─ rooms
           │   ├─ images (metadata)
           │   ├─ agent_logs
           │   └─ floor_plan_snapshots
           │
           ├─► Cloudflare Images (blob storage)
           │
           └─► Gemini API (AI generation)
```

## Tech Stack

- **Runtime**: Cloudflare Workers (API) + Cloudflare Containers (Frontend)
- **Frontend**: Next.js 15 + React 19 + TypeScript
- **API Framework**: Hono (lightweight, fast)
- **Database**: Cloudflare D1 (serverless SQLite)
- **ORM**: Drizzle ORM
- **Storage**: Cloudflare Images
- **AI**: Google Gemini API (vision, reasoning, image generation)

## Features

- 📐 **Blueprint Digitization**: AI-powered floor plan vectorization
- 🏗️ **Wizard-based Workflow**: Step-by-step calibration and annotation
- 🎨 **3D Visualization**: Generate photorealistic renders
- 💾 **Version History**: Snapshot system for rollback
- 📊 **Agent Logging**: Audit trail of AI decisions
- 🖼️ **Image Management**: Cloudflare Images integration
- 🔄 **Real-time Sync**: Database-backed state persistence

## Project Structure

```
remodel/
├── worker/
│   ├── db/
│   │   └── schema.ts              # Drizzle ORM schema
│   ├── services/
│   │   └── imageService.ts        # Cloudflare Images service
│   └── index.ts                   # Hono API + Container proxy
├── src/
│   ├── app/
│   │   ├── page.tsx               # Main application
│   │   └── layout.tsx
│   ├── components/                # React components
│   ├── lib/
│   │   ├── api.ts                 # Frontend API client
│   │   └── gemini.ts              # Gemini API wrapper
│   └── types/
│       └── index.ts               # TypeScript types
├── migrations/
│   └── 0000_last_marvex.sql       # D1 database schema
├── wrangler.jsonc                 # Cloudflare Worker config
├── drizzle.config.ts              # Drizzle ORM config
├── INTEGRATION_GUIDE.md           # Integration examples
└── package.json
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Database

```bash
# Generate migration files
npm run db:generate

# Apply migrations (local development)
npm run db:migrate:local

# Apply migrations (production)
npm run db:migrate:remote
```

### 3. Configure Secrets

```bash
# Set Gemini API key
npx wrangler secret put GEMINI_API_KEY

# Set Cloudflare Images token
npx wrangler secret put CF_IMAGES_TOKEN

# Set Cloudflare Account ID
npx wrangler secret put CF_ACCOUNT_ID
```

### 4. Run Development Server

```bash
# Option 1: Run worker locally (with D1 and API)
npm run worker:dev

# Option 2: Run Next.js dev server (frontend only)
npm run dev
```

### 5. Deploy to Production

```bash
# Deploy worker + container
npm run worker:deploy

# Or use wrangler directly
npx wrangler deploy
```

## Database Schema

### projects
Top-level container for user projects.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | Unique project ID |
| name | TEXT | Project name |
| user_id | TEXT | User identifier |
| created_at | INTEGER | Unix timestamp |
| updated_at | INTEGER | Unix timestamp |

### floors
Individual floors within a building.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | Unique floor ID |
| project_id | TEXT (FK) | Parent project |
| name | TEXT | Floor name (e.g., "Main Floor") |
| scale_ratio | REAL | Pixels per foot |
| is_calibrated | BOOLEAN | Calibration status |
| orientation_data | JSON | Front door, garage, compass data |
| is_underground | BOOLEAN | Basement/underground flag |
| stair_location | JSON | Staircase bounding box |
| sort_order | INTEGER | Display order |

### rooms
Rooms within floors with dimensions and remodel goals.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | Unique room ID |
| floor_id | TEXT (FK) | Parent floor |
| name | TEXT | Room name |
| width_ft | REAL | Width in feet |
| length_ft | REAL | Length in feet |
| approx_area | REAL | Square footage |
| polygon_json | JSON | Vector polygon coordinates |
| label_position | JSON | Label x, y position |
| remodel_goals | TEXT | User's remodeling goals |
| remodel_goals_json | JSON | Structured goals data |

### images
All images with Cloudflare Images integration.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | Database ID |
| owner_type | TEXT | 'project', 'floor', or 'room' |
| owner_id | TEXT | Owner's ID |
| cloudflare_id | TEXT (UNIQUE) | CF Images ID |
| public_url | TEXT | Public image URL |
| type | TEXT | Image classification (see types below) |
| prompt_used | TEXT | AI generation prompt |
| generation_model | TEXT | Model used (e.g., gemini-2.5-flash) |
| width | INTEGER | Image width |
| height | INTEGER | Image height |

**Image Types:**
- `blueprint_original` - Original uploaded blueprint
- `blueprint_processed` - AI-processed/digitized blueprint
- `room_listing_photo` - Pre-remodel "current state" photo
- `render_3d` - Generated 3D render
- `render_interior` - First-person interior render
- `render_edited` - Edited design render
- `render_video_frame` - Video walkthrough frame

### agent_logs
AI agent thought process and actions for auditing.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | Log ID |
| floor_id | TEXT (FK) | Associated floor |
| step_name | TEXT | Wizard step (e.g., "CALIBRATION") |
| thought_process | TEXT | AI reasoning |
| action_taken | TEXT | Action executed |
| input_data | JSON | Input parameters |
| output_data | JSON | Result data |
| status | TEXT | 'success', 'error', or 'warning' |

### floor_plan_snapshots
Version history for floor plans.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | Snapshot ID |
| floor_id | TEXT (FK) | Parent floor |
| version_number | INTEGER | Sequential version |
| description | TEXT | Version description |
| plan_data | JSON | Complete FloorPlanData |
| remodel_zone | JSON | Remodel zone bounds |

## API Endpoints

See [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) for detailed examples.

### Projects
- `POST /api/projects/init` - Create new project
- `GET /api/projects/:id` - Get project with nested data

### Floors
- `POST /api/floors/create` - Create new floor
- `POST /api/floors/:id/sync` - Update floor metadata

### Rooms
- `POST /api/rooms` - Create/update room

### Images
- `POST /api/images/upload` - Upload to Cloudflare Images
- `GET /api/images/:ownerType/:ownerId` - Get images for owner

### Visuals
- `POST /api/generate/visual` - Generate + upload AI visual

### Logs
- `POST /api/logs` - Create agent log
- `GET /api/logs/:floorId` - Get floor logs

### Snapshots
- `POST /api/snapshots` - Save floor plan snapshot

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| GEMINI_API_KEY | Yes | Google Gemini API key |
| CF_IMAGES_TOKEN | Yes | Cloudflare Images API token |
| CF_ACCOUNT_ID | Yes | Cloudflare account ID |
| ENVIRONMENT | No | Environment name (default: "production") |

## Development Workflow

### 1. Schema Changes

When you modify the database schema:

```bash
# Edit worker/db/schema.ts
# Then generate new migration
npm run db:generate

# Apply migration locally
npm run db:migrate:local

# Test changes
npm run worker:dev
```

### 2. Adding API Endpoints

1. Add route in `worker/index.ts`
2. Update `src/lib/api.ts` with typed client method
3. Use in frontend components

### 3. Frontend Integration

```typescript
import { projectsApi, floorsApi, imagesApi } from '@/lib/api';

// Initialize project
const { project } = await projectsApi.init('My Project');

// Create floor
const { floor } = await floorsApi.create(project.id, 'Main Floor');

// Upload blueprint
const result = await imagesApi.upload({
  base64Data: blueprintBase64,
  ownerType: 'floor',
  ownerId: floor.id,
  type: 'blueprint_original',
});
```

## Deployment Checklist

- [ ] Set all secrets (`GEMINI_API_KEY`, `CF_IMAGES_TOKEN`, `CF_ACCOUNT_ID`)
- [ ] Run migrations: `npm run db:migrate:remote`
- [ ] Test API endpoints: `npx wrangler tail`
- [ ] Deploy worker: `npm run worker:deploy`
- [ ] Verify health check: `curl https://your-domain.com/health`
- [ ] Test image upload to Cloudflare Images
- [ ] Test Gemini API integration

## Troubleshooting

### Database Issues

```bash
# View database contents
npx wrangler d1 execute remodel --local --command "SELECT * FROM projects"

# Reset database (DANGER: THIS DELETES ALL DATA. USE WITH EXTREME CAUTION.)
npx wrangler d1 execute remodel --local --command "DROP TABLE projects"
npm run db:migrate:local
```

### Worker Logs

```bash
# Tail worker logs
npx wrangler tail

# View specific log
npx wrangler tail --format json
```

### Common Errors

**"DB is not defined"**
- Check `wrangler.jsonc` has correct D1 binding
- Ensure migrations have been applied

**"Cloudflare Images upload failed"**
- Verify `CF_IMAGES_TOKEN` secret is set
- Check `CF_ACCOUNT_ID` matches your account

**"GEMINI_API_KEY not set"**
- Run `npx wrangler secret put GEMINI_API_KEY`

## Performance Optimization

- **D1 Database**: Automatic caching, <5ms reads
- **Cloudflare Images**: Global CDN, automatic optimization
- **Worker**: Edge execution, <50ms cold starts
- **Container**: Persistent Next.js instance

## Security Considerations

1. **API Keys**: Store in Wrangler secrets, never commit to git
2. **CORS**: Configured for `/api/*` routes only
3. **SQL Injection**: Drizzle ORM parameterizes all queries
4. **Image Validation**: Validate MIME types before upload
5. **User Auth**: Add authentication layer for multi-user support

## Contributing

See [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) for integration patterns.

## License

Private project - All rights reserved

## Support

For issues or questions:
1. Check [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md)
2. Review API endpoint documentation above
3. Check Cloudflare dashboard for D1/Images status
4. View worker logs: `npx wrangler tail`
