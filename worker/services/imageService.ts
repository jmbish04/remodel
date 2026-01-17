/**
 * Cloudflare Images Service
 *
 * Manages image uploads to Cloudflare Images CDN and syncs metadata to D1 database.
 * Supports both Blob/File and base64-encoded images.
 */

import { drizzle } from 'drizzle-orm/d1';
import { images, type NewImage } from '../db/schema';

/**
 * Metadata required for image upload and database logging
 */
export interface ImageMetadata {
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
}

/**
 * Result returned after successful image upload
 */
export interface UploadResult {
  id: string;
  cloudflareId: string;
  publicUrl: string;
  variants: string[];
}

/**
 * Uploads an image to Cloudflare Images and creates a D1 database record
 *
 * @param blob - Image file (Blob or File object)
 * @param metadata - Classification and ownership metadata
 * @param env - Worker environment with CF_IMAGES_TOKEN, CF_ACCOUNT_ID, and DB bindings
 * @returns Upload result containing database ID, Cloudflare ID, and public URL
 */
export async function uploadImage(
  blob: Blob,
  metadata: ImageMetadata,
  env: {
    CF_IMAGES_TOKEN: string;
    CF_ACCOUNT_ID: string;
    DB: D1Database;
  }
): Promise<UploadResult> {
  const dbId = crypto.randomUUID();

  // Prepare multipart form data for Cloudflare Images API
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('id', dbId);
  formData.append('requireSignedURLs', 'false');
  formData.append('metadata', JSON.stringify({
    ownerType: metadata.ownerType,
    ownerId: metadata.ownerId,
    type: metadata.type,
  }));

  const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1`;
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_IMAGES_TOKEN}`,
    },
    body: formData,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Cloudflare Images upload failed: ${uploadResponse.status} - ${errorText}`);
  }

  const uploadResult = await uploadResponse.json() as {
    success: boolean;
    result: {
      id: string;
      filename: string;
      uploaded: string;
      requireSignedURLs: boolean;
      variants: string[];
    };
    errors: Array<{ code: number; message: string }>;
  };

  if (!uploadResult.success) {
    throw new Error(`Cloudflare Images API error: ${JSON.stringify(uploadResult.errors)}`);
  }

  const cloudflareId = uploadResult.result.id;
  const variants = uploadResult.result.variants;
  const publicUrl = variants.find(v => v.includes('/public')) || variants[0];
  const fileSize = blob.size;

  // Create database record with image metadata
  const db = drizzle(env.DB);
  const newImage: NewImage = {
    id: dbId,
    ownerType: metadata.ownerType,
    ownerId: metadata.ownerId,
    cloudflareId,
    publicUrl,
    type: metadata.type,
    promptUsed: metadata.promptUsed || null,
    generationModel: metadata.generationModel || null,
    width: metadata.width || null,
    height: metadata.height || null,
    mimeType: blob.type || 'image/png',
    fileSize,
  };

  await db.insert(images).values(newImage);

  return {
    id: dbId,
    cloudflareId,
    publicUrl,
    variants,
  };
}

/**
 * Uploads a base64-encoded image to Cloudflare Images
 *
 * Convenience wrapper that converts base64 strings to Blob before uploading.
 * Automatically detects MIME type from data URL prefix.
 *
 * @param base64Data - Base64 string with optional data URL prefix (e.g., "data:image/png;base64,...")
 * @param metadata - Classification and ownership metadata
 * @param env - Worker environment with CF_IMAGES_TOKEN, CF_ACCOUNT_ID, and DB bindings
 * @returns Upload result containing database ID, Cloudflare ID, and public URL
 */
export async function uploadBase64Image(
  base64Data: string,
  metadata: ImageMetadata,
  env: {
    CF_IMAGES_TOKEN: string;
    CF_ACCOUNT_ID: string;
    DB: D1Database;
  }
): Promise<UploadResult> {
  const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

  // Decode base64 to binary
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Detect MIME type from data URL prefix
  let mimeType = 'image/png';
  if (base64Data.startsWith('data:image/jpeg') || base64Data.startsWith('data:image/jpg')) {
    mimeType = 'image/jpeg';
  } else if (base64Data.startsWith('data:image/webp')) {
    mimeType = 'image/webp';
  }

  const blob = new Blob([bytes], { type: mimeType });

  return uploadImage(blob, metadata, env);
}

/**
 * Deletes an image from both Cloudflare Images CDN and D1 database
 *
 * Database deletion proceeds even if Cloudflare deletion fails to prevent orphaned records.
 *
 * @param imageId - Database record ID
 * @param env - Worker environment with CF_IMAGES_TOKEN, CF_ACCOUNT_ID, and DB bindings
 * @throws Error if image record not found in database
 */
export async function deleteImage(
  imageId: string,
  env: {
    CF_IMAGES_TOKEN: string;
    CF_ACCOUNT_ID: string;
    DB: D1Database;
  }
): Promise<void> {
  const db = drizzle(env.DB);

  const imageRecord = await db.select().from(images).where(images.id.eq(imageId)).get();

  if (!imageRecord) {
    throw new Error(`Image not found: ${imageId}`);
  }

  // Attempt to delete from Cloudflare Images
  const deleteUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${imageRecord.cloudflareId}`;
  const deleteResponse = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${env.CF_IMAGES_TOKEN}`,
    },
  });

  if (!deleteResponse.ok) {
    const errorText = await deleteResponse.text();
    console.error(`Failed to delete from Cloudflare Images: ${deleteResponse.status} - ${errorText}`);
    throw new Error('Failed to delete image from Cloudflare Images.');
  }

  // Always delete from database to prevent orphaned records
  await db.delete(images).where(images.id.eq(imageId));
}

/**
 * Retrieves all images associated with a specific owner
 *
 * @param ownerType - Owner classification ('project', 'floor', or 'room')
 * @param ownerId - Owner's database ID
 * @param env - Worker environment with DB binding
 * @returns Array of image records with metadata and URLs
 */
export async function getImagesForOwner(
  ownerType: 'project' | 'floor' | 'room',
  ownerId: string,
  env: { DB: D1Database }
): Promise<Array<typeof images.$inferSelect>> {
  const db = drizzle(env.DB);

  return db
    .select()
    .from(images)
    .where(and(eq(images.ownerType, ownerType), eq(images.ownerId, ownerId)))
    .all();
}
