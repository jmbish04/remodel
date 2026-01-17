/**
 * Project management routes
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, inArray } from 'drizzle-orm';
import { projects, floors, rooms, type NewProject } from '../db/schema';

const projectsRouter = new Hono<{ Bindings: Env }>();

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

projectsRouter.get('/:id', async (c) => {
  const db = drizzle(c.env.DB);
  const projectId = c.req.param('id');

  const project = await db.select().from(projects).where(eq(projects.id, projectId)).get();

  if (!project) {
    return c.json({ success: false, error: 'Project not found' }, 404);
  }

  const projectFloors = await db.select().from(floors).where(eq(floors.projectId, projectId)).all();

  const floorIds = projectFloors.map((f) => f.id);
  const allRooms = floorIds.length > 0
    ? await db.select().from(rooms).where(inArray(rooms.floorId, floorIds)).all()
    : [];

  const roomsByFloor = allRooms.reduce<Record<string, (typeof rooms.$inferSelect)[]>>((acc, room) => {
    (acc[room.floorId] = acc[room.floorId] || []).push(room);
    return acc;
  }, {});

  const floorsWithRooms = projectFloors.map((floor) => ({
    ...floor,
    rooms: roomsByFloor[floor.id] || [],
  }));

  return c.json({
    success: true,
    project: {
      ...project,
      floors: floorsWithRooms,
    },
  });
});

projectsRouter.get('/', async (c) => {
  const db = drizzle(c.env.DB);
  const allProjects = await db.select().from(projects).all();
  return c.json({
    success: true,
    projects: allProjects,
  });
});

export default projectsRouter;
