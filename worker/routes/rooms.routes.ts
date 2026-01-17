/**
 * Room management routes
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { rooms, type NewRoom } from '../db/schema';
import type { Env } from '../types';

const roomsRouter = new Hono<{ Bindings: Env }>();

roomsRouter.post('/', async (c) => {
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

export default roomsRouter;
