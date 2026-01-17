# Smart Home Remodeler - Production Upgrade Integration Guide

This guide explains how to integrate the new database-backed API into your existing frontend application.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Worker (worker/index.ts)                    │
│  ┌────────────────────┐   ┌──────────────────────────┐  │
│  │  Hono API Gateway  │   │  Container Proxy         │  │
│  │  /api/*            │   │  /* (all other routes)   │  │
│  │  - Projects        │   │  → Next.js Container     │  │
│  │  - Floors          │   │                          │  │
│  │  - Rooms           │   │                          │  │
│  │  - Images          │   │                          │  │
│  │  - Visuals         │   │                          │  │
│  │  - Logs            │   │                          │  │
│  └────────────────────┘   └──────────────────────────┘  │
│           ↓                                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Drizzle ORM + D1 Database (SQLite)              │   │
│  │  - projects, floors, rooms, images, agent_logs   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                      ↓
          ┌───────────────────────┐
          │  Cloudflare Images    │
          │  (Image Storage)      │
          └───────────────────────┘
```

## Setup Instructions

### 1. Database Migration

Run the initial migration to create all tables:

```bash
# Apply migrations to local D1 database (for development)
npx wrangler d1 execute remodel --local --file=./migrations/0000_last_marvex.sql

# Apply migrations to remote D1 database (for production)
npx wrangler d1 execute remodel --remote --file=./migrations/0000_last_marvex.sql
```

### 2. Environment Secrets

Set the required secrets using Wrangler:

```bash
# Gemini API Key
npx wrangler secret put GEMINI_API_KEY

# Cloudflare Images Token
npx wrangler secret put CF_IMAGES_TOKEN

# Cloudflare Account ID
npx wrangler secret put CF_ACCOUNT_ID
```

### 3. Frontend Integration Examples

#### Example 1: Initialize a Project on Startup

```typescript
// In src/app/page.tsx or your main component

import { useEffect, useState } from 'react';
import { projectsApi } from '@/lib/api';

export default function Home() {
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    // Initialize or load project on startup
    async function initProject() {
      try {
        // Check localStorage for existing project ID
        const storedProjectId = localStorage.getItem('currentProjectId');

        if (storedProjectId) {
          // Load existing project
          const { project } = await projectsApi.get(storedProjectId);
          setProjectId(project.id);
        } else {
          // Create new project
          const { project } = await projectsApi.init('My Smart Home Remodel');
          setProjectId(project.id);
          localStorage.setItem('currentProjectId', project.id);
        }
      } catch (error) {
        console.error('Failed to initialize project:', error);
      }
    }

    initProject();
  }, []);

  // Rest of your component...
}
```

#### Example 2: Upload Blueprint and Create Floor

```typescript
// When user uploads a floor plan image

import { floorsApi, imagesApi } from '@/lib/api';
import { fileToBase64 } from '@/lib/gemini';

async function handleFloorUpload(file: File, projectId: string, floorName: string) {
  try {
    // 1. Create floor record in database
    const { floor } = await floorsApi.create(projectId, floorName);

    // 2. Convert file to base64
    const base64Data = await fileToBase64(file);

    // 3. Upload blueprint image to Cloudflare Images
    const uploadResult = await imagesApi.upload({
      base64Data: `data:image/png;base64,${base64Data}`,
      ownerType: 'floor',
      ownerId: floor.id,
      type: 'blueprint_original',
      // width and height are optional, but recommended.
      // They must be obtained by loading the image file first.
    });

    console.log('Blueprint uploaded:', uploadResult.publicUrl);

    // 4. Store floor data in local state
    setFloors(prev => [...prev, {
      ...floor,
      imageSrc: uploadResult.publicUrl,
      imageDims: { width: file.width, height: file.height },
    }]);

  } catch (error) {
    console.error('Failed to upload floor:', error);
  }
}
```

#### Example 3: Log Agent Actions During Wizard

```typescript
// When wizard advances to a new step

import { logsApi } from '@/lib/api';

async function logWizardStep(
  floorId: string,
  stepName: string,
  action: string,
  thought?: string
) {
  try {
    await logsApi.create({
      floorId,
      stepName,
      thoughtProcess: thought,
      actionTaken: action,
      status: 'success',
    });
  } catch (error) {
    console.error('Failed to log wizard step:', error);
  }
}

// Example usage:
async function handleCalibrationComplete(floorId: string, scaleRatio: number) {
  // Update floor with calibration data
  await floorsApi.sync(floorId, {
    scaleRatio,
    isCalibrated: true,
  });

  // Log the action
  await logWizardStep(
    floorId,
    'CALIBRATION',
    `Set scale ratio to ${scaleRatio} pixels per foot`,
    'User completed calibration by drawing ruler on blueprint'
  );
}
```

#### Example 4: Upload Room Listing Photos

```typescript
// When user adds "current state" photos to a room

import { imagesApi, roomsApi } from '@/lib/api';

async function uploadRoomPhoto(
  roomId: string,
  photoFile: File
) {
  try {
    const base64Data = await fileToBase64(photoFile);

    const uploadResult = await imagesApi.upload({
      base64Data: `data:image/png;base64,${base64Data}`,
      ownerType: 'room',
      ownerId: roomId,
      type: 'room_listing_photo',
    });

    console.log('Room photo uploaded:', uploadResult.publicUrl);
    return uploadResult;
  } catch (error) {
    console.error('Failed to upload room photo:', error);
  }
}
```

#### Example 5: Generate 3D Render via API

```typescript
// Generate a 3D render and save to Cloudflare Images

import { visualsApi } from '@/lib/api';

async function generate3DRender(
  floorId: string,
  blueprintBase64: string,
  perspective: string = 'isometric'
) {
  try {
    const result = await visualsApi.generate({
      imageBase64: blueprintBase64,
      prompt: `Turn this technical 2D floorplan into a high-fidelity ${perspective} 3D floorplan render. Style: photorealistic modern. Keep the exact layout, wall positions, and room dimensions identical to the source image.`,
      generationType: 'render_3d',
      ownerId: floorId,
      ownerType: 'floor',
    });

    console.log('3D render generated:', result.imageUrl);
    return result;
  } catch (error) {
    console.error('Failed to generate 3D render:', error);
  }
}
```

#### Example 6: Save Floor Plan Snapshot for Version History

```typescript
// Save a snapshot whenever user makes changes

import { snapshotsApi } from '@/lib/api';
import { FloorPlanData } from '@/types';

async function saveFloorPlanSnapshot(
  floorId: string,
  versionNumber: number,
  planData: FloorPlanData,
  description?: string
) {
  try {
    await snapshotsApi.create({
      floorId,
      versionNumber,
      description: description || `Version ${versionNumber}`,
      planData,
    });

    console.log('Snapshot saved');
  } catch (error) {
    console.error('Failed to save snapshot:', error);
  }
}
```

## API Endpoints Reference

### Projects
- `POST /api/projects/init` - Create new project
- `GET /api/projects/:id` - Get project with all floors and rooms

### Floors
- `POST /api/floors/create` - Create new floor
- `POST /api/floors/:id/sync` - Update floor data (scale, orientation, stairs)

### Rooms
- `POST /api/rooms` - Create or update room

### Images
- `POST /api/images/upload` - Upload image to Cloudflare Images
- `GET /api/images/:ownerType/:ownerId` - Get images for owner

### Visuals
- `POST /api/generate/visual` - Generate visual via Gemini + upload to CF Images

### Logs
- `POST /api/logs` - Create agent log
- `GET /api/logs/:floorId` - Get logs for floor

### Snapshots
- `POST /api/snapshots` - Save floor plan snapshot

## Database Schema

### projects
- `id` (PK)
- `name`
- `user_id`
- `created_at`, `updated_at`

### floors
- `id` (PK)
- `project_id` (FK)
- `name`
- `scale_ratio` (pixels per foot)
- `is_calibrated`
- `orientation_data` (JSON: frontDoorId, garageRect, frontAngle)
- `is_underground`
- `stair_location` (JSON: x, y, width, height)
- `sort_order`
- `created_at`, `updated_at`

### rooms
- `id` (PK)
- `floor_id` (FK)
- `name`
- `width_ft`, `length_ft`, `approx_area`
- `polygon_json` (vector coords)
- `label_position`
- `remodel_goals`, `remodel_goals_json`
- `created_at`, `updated_at`

### images
- `id` (PK)
- `owner_type` ('project', 'floor', 'room')
- `owner_id`
- `cloudflare_id` (unique)
- `public_url`
- `type` ('blueprint_original', 'blueprint_processed', 'room_listing_photo', 'render_3d', 'render_interior', 'render_edited', 'render_video_frame')
- `prompt_used`, `generation_model`
- `width`, `height`, `mime_type`, `file_size`
- `created_at`

### agent_logs
- `id` (PK)
- `floor_id` (FK)
- `step_name`, `step_index`
- `thought_process`, `action_taken`
- `input_data`, `output_data`
- `status`, `error_message`
- `timestamp`

### floor_plan_snapshots
- `id` (PK)
- `floor_id` (FK)
- `version_number`
- `description`
- `plan_data` (complete FloorPlanData JSON)
- `remodel_zone`
- `created_at`

## Deployment

### Local Development

```bash
# Run worker locally with D1 database
npx wrangler dev

# Or run Next.js dev server (if not using container proxy)
npm run dev
```

### Production Deployment

```bash
# Deploy worker + container
npx wrangler deploy

# Apply migrations to production D1
npx wrangler d1 execute remodel --remote --file=./migrations/0000_last_marvex.sql
```

## Best Practices

1. **Always create a project first** before creating floors or rooms
2. **Upload blueprint images** immediately after creating a floor record
3. **Log wizard steps** for debugging and audit trail
4. **Save snapshots** before and after major remodel operations
5. **Use the typed API client** (`src/lib/api.ts`) for all API calls
6. **Handle errors gracefully** - all API methods can throw errors
7. **Store IDs in state** - Keep project/floor/room IDs in React state or localStorage

## Troubleshooting

### Common Issues

1. **"Image upload failed"**: Check CF_IMAGES_TOKEN and CF_ACCOUNT_ID secrets
2. **"Database not found"**: Run migrations with `wrangler d1 execute`
3. **"GEMINI_API_KEY not set"**: Configure secret with `wrangler secret put GEMINI_API_KEY`
4. **CORS errors**: Ensure the worker is handling `/api/*` routes correctly

### Debug Tools

```bash
# View D1 database contents
npx wrangler d1 execute remodel --local --command "SELECT * FROM projects"

# Check worker logs
npx wrangler tail

# List secrets
npx wrangler secret list
```

## Next Steps

1. Integrate project initialization into App.tsx
2. Add image upload calls when user uploads blueprints
3. Add logging calls when wizard steps advance
4. Replace local Gemini calls with API `/generate/visual` endpoint
5. Add snapshot saving on remodel operations
6. Build admin panel to view logs and snapshots
