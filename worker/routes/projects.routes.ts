/**
 * Project management routes
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm';
import { projects, floors, rooms, type NewProject } from '../db/schema';
import type { Env } from '../types';

const projectsRouter = new Hono<{ Bindings: Env }>();

/**
 * Creates a new remodeling project
 * POST /api/projects/init
 */
projectsRouter.post('/init', async (c) => {
  const db = drizzle(c.env.DB);
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
 * Retrieves a project with all nested floors and rooms
 * GET /api/projects/:id
 */
projectsRouter.get('/:id', async (c) => {
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

export default projectsRouter;
