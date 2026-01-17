/**
 * Floor plan snapshot routes (version history)
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { floorPlanSnapshots, type NewFloorPlanSnapshot } from '../db/schema';
import type { Env } from '../types';

const snapshotsRouter = new Hono<{ Bindings: Env }>();

snapshotsRouter.post('/', async (c) => {
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

export default snapshotsRouter;
