/**
 * Image management routes
 */

import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { eq, and } from 'drizzle-orm';
import { images } from '../db/schema';
import { uploadBase64Image } from '../services/imageService';
import type { Env } from '../types';

const imagesRouter = new Hono<{ Bindings: Env }>();

/**
 * Uploads an image to Cloudflare Images CDN and logs metadata to D1
 * POST /api/images/upload
 */
imagesRouter.post('/upload', async (c) => {
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
 * Retrieves all images for a specific owner (project, floor, or room)
 * GET /api/images/:ownerType/:ownerId
 */
imagesRouter.get('/:ownerType/:ownerId', async (c) => {
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

export default imagesRouter;
