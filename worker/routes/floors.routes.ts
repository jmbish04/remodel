/**
 * Floor management routes
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { floors, type NewFloor } from '../db/schema';

const floorsRouter = new Hono<{ Bindings: Env }>();

floorsRouter.post('/create', async (c) => {
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

floorsRouter.post('/:id/sync', async (c) => {
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

export default floorsRouter;
