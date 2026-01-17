/**
 * Cloudflare Worker - Hono API Gateway + Next.js Container Proxy
 *
 * Architecture:
 * - /api/* → Hono routes (REST API for D1, Cloudflare Images, Gemini AI)
 * - /* → Next.js container (frontend application)
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/d1';
import {
  projects,
  floors,
  rooms,
  images,
  agentLogs,
  floorPlanSnapshots,
  type NewProject,
  type NewFloor,
  type NewRoom,
  type NewAgentLog,
  type NewFloorPlanSnapshot,
} from './db/schema';
import { uploadImage, uploadBase64Image } from './services/imageService';
import { eq, and } from 'drizzle-orm';

/**
 * Worker environment bindings (secrets, D1, container)
 */
export interface Env {
  ENVIRONMENT: string;
  GEMINI_API_KEY: string;
  CF_IMAGES_TOKEN: string;
  CF_ACCOUNT_ID: string;
  DB: D1Database;
  AI_ARCHITECT: Fetcher;
}

/**
 * Hono application instance with typed environment bindings
 */
const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all API endpoints
app.use('/api/*', cors());

/**
 * Inject Drizzle ORM client into request context
 */
app.use('/api/*', async (c, next) => {
  const db = drizzle(c.env.DB);
  c.set('db', db);
  await next();
});

// ============================================================================
// Health Check
// ============================================================================

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// API Routes - Project Management
// ============================================================================

/**
 * Creates a new remodeling project
 * POST /api/projects/init
 */
app.post('/api/projects/init', async (c) => {
  const db = c.get('db');
  const body = await c.req.json<{ name: string; userId?: string }>();

  const projectId = crypto.randomUUID();
  const newProject: NewProject = {
    id: projectId,
    name: body.name || 'Untitled Project',
    userId: body.userId || 'default-user',
  };

  await db.insert(projects).values(newProject);

  return c.json({
    success: true,
    project: newProject,
  });
});

/**
 * Creates a new floor within a project
 * POST /api/floors/create
 */
app.post('/api/floors/create', async (c) => {
  const db = drizzle(c.env.DB);
  const body = await c.req.json<{
    projectId: string;
    name: string;
    isUnderground?: boolean;
    sortOrder?: number;
  }>();

  const floorId = crypto.randomUUID();
  const newFloor: NewFloor = {
    id: floorId,
    projectId: body.projectId,
    name: body.name,
    isUnderground: body.isUnderground || false,
    sortOrder: body.sortOrder || 0,
  };

  await db.insert(floors).values(newFloor);

  return c.json({
    success: true,
    floor: newFloor,
  });
});

/**
 * Syncs floor calibration data (scale ratio, orientation, stairs)
 * POST /api/floors/:id/sync
 */
app.post('/api/floors/:id/sync', async (c) => {
  const db = drizzle(c.env.DB);
  const floorId = c.req.param('id');
  const body = await c.req.json<{
    scaleRatio?: number;
    isCalibrated?: boolean;
    orientationData?: {
      frontDoorId?: string;
      garageRect?: { x: number; y: number; width: number; height: number };
      garageWidth?: number;
      frontAngle?: number;
    };
    stairLocation?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>();

  const updateData: Partial<typeof floors.$inferInsert> = {};

  if (body.scaleRatio !== undefined) updateData.scaleRatio = body.scaleRatio;
  if (body.isCalibrated !== undefined) updateData.isCalibrated = body.isCalibrated;
  if (body.orientationData !== undefined) updateData.orientationData = body.orientationData;
  if (body.stairLocation !== undefined) updateData.stairLocation = body.stairLocation;

  await db.update(floors).set({ ...updateData, updatedAt: new Date() }).where(eq(floors.id, floorId));

  return c.json({
    success: true,
    floorId,
  });
});

/**
 * Creates or updates a room with dimensions and remodel goals
 * POST /api/rooms
 */
app.post('/api/rooms', async (c) => {
  const db = drizzle(c.env.DB);
  const body = await c.req.json<{
    id?: string;
    floorId: string;
    name: string;
    widthFt?: number;
    lengthFt?: number;
    approxArea?: number;
    polygonJson?: Array<{ x: number; y: number }>;
    labelPosition?: { x: number; y: number };
    remodelGoals?: string;
    remodelGoalsJson?: {
      description?: string;
      budget?: number;
      style?: string;
      priorities?: string[];
    };
  }>();

  if (body.id) {
    // Update existing room
    const updateData: Partial<typeof rooms.$inferInsert> = {
      name: body.name,
      widthFt: body.widthFt,
      lengthFt: body.lengthFt,
      approxArea: body.approxArea,
      polygonJson: body.polygonJson,
      labelPosition: body.labelPosition,
      remodelGoals: body.remodelGoals,
      remodelGoalsJson: body.remodelGoalsJson,
    };

    await db.update(rooms).set({ ...updateData, updatedAt: new Date() }).where(eq(rooms.id, body.id));

    return c.json({
      success: true,
      roomId: body.id,
    });
  } else {
    // Create new room
    const roomId = crypto.randomUUID();
    const newRoom: NewRoom = {
      id: roomId,
      floorId: body.floorId,
      name: body.name,
      widthFt: body.widthFt,
      lengthFt: body.lengthFt,
      approxArea: body.approxArea,
      polygonJson: body.polygonJson,
      labelPosition: body.labelPosition,
      remodelGoals: body.remodelGoals,
      remodelGoalsJson: body.remodelGoalsJson,
    };

    await db.insert(rooms).values(newRoom);

    return c.json({
      success: true,
      roomId,
      room: newRoom,
    });
  }
});

/**
 * Uploads an image to Cloudflare Images CDN and logs metadata to D1
 * POST /api/images/upload
 */
app.post('/api/images/upload', async (c) => {
  const body = await c.req.json<{
    base64Data: string;
    ownerType: 'project' | 'floor' | 'room';
    ownerId: string;
    type:
      | 'blueprint_original'
      | 'blueprint_processed'
      | 'room_listing_photo'
      | 'render_3d'
      | 'render_interior'
      | 'render_edited'
      | 'render_video_frame';
    promptUsed?: string;
    generationModel?: string;
    width?: number;
    height?: number;
  }>();

  const result = await uploadBase64Image(
    body.base64Data,
    {
      ownerType: body.ownerType,
      ownerId: body.ownerId,
      type: body.type,
      promptUsed: body.promptUsed,
      generationModel: body.generationModel,
      width: body.width,
      height: body.height,
    },
    {
      CF_IMAGES_TOKEN: c.env.CF_IMAGES_TOKEN,
      CF_ACCOUNT_ID: c.env.CF_ACCOUNT_ID,
      DB: c.env.DB,
    }
  );

  return c.json({
    success: true,
    ...result,
  });
});

/**
 * Generates AI visual (3D render, interior view, etc.) via Gemini and uploads to CDN
 * POST /api/generate/visual
 */
app.post('/api/generate/visual', async (c) => {
  const body = await c.req.json<{
    imageBase64: string;
    prompt: string;
    generationType: 'render_3d' | 'render_interior' | 'render_edited' | 'render_video_frame';
    ownerId: string;
    ownerType: 'floor' | 'room';
    model?: string;
  }>();

  const model = body.model || 'gemini-2.5-flash-image-preview';
  const cleanBase64 = body.imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${c.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: body.prompt },
              { inlineData: { mimeType: 'image/png', data: cleanBase64 } },
            ],
          },
        ],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    }
  );

  if (!geminiResponse.ok) {
    return c.json(
      {
        success: false,
        error: `Gemini API error: ${geminiResponse.status}`,
      },
      500
    );
  }

  const geminiData = await geminiResponse.json();
  const candidates = geminiData.candidates;

  if (!candidates || candidates.length === 0) {
    return c.json(
      {
        success: false,
        error: 'No image generated from Gemini',
      },
      500
    );
  }

  const parts = candidates[0].content.parts;
  const imagePart = parts.find((p: Record<string, unknown>) => p.inlineData);

  if (!imagePart) {
    return c.json(
      {
        success: false,
        error: 'No image data in Gemini response',
      },
      500
    );
  }

  const generatedBase64 = `data:image/png;base64,${imagePart.inlineData.data}`;

  const uploadResult = await uploadBase64Image(
    generatedBase64,
    {
      ownerType: body.ownerType,
      ownerId: body.ownerId,
      type: body.generationType,
      promptUsed: body.prompt,
      generationModel: model,
    },
    {
      CF_IMAGES_TOKEN: c.env.CF_IMAGES_TOKEN,
      CF_ACCOUNT_ID: c.env.CF_ACCOUNT_ID,
      DB: c.env.DB,
    }
  );

  return c.json({
    success: true,
    imageUrl: uploadResult.publicUrl,
    imageId: uploadResult.id,
    base64: generatedBase64,
  });
});

/**
 * Records AI agent decision and action for audit trail
 * POST /api/logs
 */
app.post('/api/logs', async (c) => {
  const db = drizzle(c.env.DB);
  const body = await c.req.json<{
    floorId: string;
    stepName: string;
    stepIndex?: number;
    thoughtProcess?: string;
    actionTaken: string;
    inputData?: Record<string, unknown>;
    outputData?: Record<string, unknown>;
    status?: 'success' | 'error' | 'warning';
    errorMessage?: string;
  }>();

  const logId = crypto.randomUUID();
  const newLog: NewAgentLog = {
    id: logId,
    floorId: body.floorId,
    stepName: body.stepName,
    stepIndex: body.stepIndex || null,
    thoughtProcess: body.thoughtProcess || null,
    actionTaken: body.actionTaken,
    inputData: body.inputData || null,
    outputData: body.outputData || null,
    status: body.status || 'success',
    errorMessage: body.errorMessage || null,
  };

  await db.insert(agentLogs).values(newLog);

  return c.json({
    success: true,
    logId,
  });
});

/**
 * Saves a complete floor plan snapshot for version history and rollback
 * POST /api/snapshots
 */
app.post('/api/snapshots', async (c) => {
  const db = drizzle(c.env.DB);
  const body = await c.req.json<{
    floorId: string;
    versionNumber: number;
    description?: string;
    planData: {
      walls: Array<{
        id: string;
        start: { x: number; y: number };
        end: { x: number; y: number };
        type: 'wall' | 'window' | 'door' | 'opening';
        doorType?: string;
        isExternal: boolean;
        isLoadBearing?: boolean;
      }>;
      rooms: Array<{
        id: string;
        name: string;
        labelPosition: { x: number; y: number };
        approxArea?: number;
        dimensions?: string;
      }>;
      width: number;
      height: number;
    };
    remodelZone?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>();

  const snapshotId = crypto.randomUUID();
  const newSnapshot: NewFloorPlanSnapshot = {
    id: snapshotId,
    floorId: body.floorId,
    versionNumber: body.versionNumber,
    description: body.description || null,
    planData: body.planData,
    remodelZone: body.remodelZone || null,
  };

  await db.insert(floorPlanSnapshots).values(newSnapshot);

  return c.json({
    success: true,
    snapshotId,
  });
});

/**
 * Retrieves a project with all nested floors and rooms
 * GET /api/projects/:id
 */
app.get('/api/projects/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const projectId = c.req.param('id');

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  const projectFloors = await db.select().from(floors).where(eq(floors.projectId, projectId)).all();

  const floorsWithRooms = await Promise.all(
    projectFloors.map(async (floor) => {
      const floorRooms = await db.select().from(rooms).where(eq(rooms.floorId, floor.id)).all();
      return {
        ...floor,
        rooms: floorRooms,
      };
    })
  );

  return c.json({
    success: true,
    project: {
      ...project,
      floors: floorsWithRooms,
    },
  });
});

/**
 * Retrieves all images for a specific owner (project, floor, or room)
 * GET /api/images/:ownerType/:ownerId
 */
app.get('/api/images/:ownerType/:ownerId', async (c) => {
  const db = drizzle(c.env.DB);
  const ownerType = c.req.param('ownerType') as 'project' | 'floor' | 'room';
  const ownerId = c.req.param('ownerId');

  const ownerImages = await db
    .select()
    .from(images)
    .where(and(eq(images.ownerType, ownerType), eq(images.ownerId, ownerId)))
    .all();

  return c.json({
    success: true,
    images: ownerImages,
  });
});

/**
 * Retrieves all agent logs for a floor (audit trail)
 * GET /api/logs/:floorId
 */
app.get('/api/logs/:floorId', async (c) => {
  const db = drizzle(c.env.DB);
  const floorId = c.req.param('floorId');

  const logs = await db.select().from(agentLogs).where(eq(agentLogs.floorId, floorId)).all();

  return c.json({
    success: true,
    logs,
  });
});

// ============================================================================
// Container Proxy - Forwards all non-API traffic to Next.js frontend
// ============================================================================

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

// ============================================================================
// Export
// ============================================================================

export default app;
