/**
 * Cloudflare Images Service
 * Handles uploading images to Cloudflare Images and logging metadata to D1
 */

import { drizzle } from 'drizzle-orm/d1';
import { images, type NewImage } from '../db/schema';

/**
 * Image upload metadata
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
 * Upload result with public URL and DB record ID
 */
export interface UploadResult {
  id: string; // DB record ID
  cloudflareId: string; // CF Images ID
  publicUrl: string;
  variants: string[]; // Available image variants
}

/**
 * Upload an image to Cloudflare Images and log to database
 *
 * @param blob - Image file as Blob or File
 * @param metadata - Image metadata for database
 * @param env - Cloudflare Worker environment with bindings
 * @returns Upload result with URLs and IDs
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
  // Generate unique ID for database record
  const dbId = crypto.randomUUID();

  // Upload to Cloudflare Images
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('id', dbId); // Use DB ID as CF Images ID for consistency
  formData.append('requireSignedURLs', 'false'); // Public images
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

  // Construct public URL (using 'public' variant)
  const publicUrl = variants.find(v => v.includes('/public')) || variants[0];

  // Get file size
  const fileSize = blob.size;

  // Insert record into database
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
 * Upload a base64-encoded image to Cloudflare Images
 * Convenience wrapper for uploadImage that handles base64 strings
 *
 * @param base64Data - Base64 string (with or without data URL prefix)
 * @param metadata - Image metadata
 * @param env - Cloudflare Worker environment
 * @returns Upload result
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
  // Clean base64 string (remove data URL prefix if present)
  const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');

  // Convert base64 to binary
  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Detect MIME type from base64 prefix or default to PNG
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
 * Delete an image from both Cloudflare Images and database
 *
 * @param imageId - Database image ID
 * @param env - Cloudflare Worker environment
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

  // Get image record to find Cloudflare ID
  const imageRecord = await db.select().from(images).where(images.id.eq(imageId)).get();

  if (!imageRecord) {
    throw new Error(`Image not found: ${imageId}`);
  }

  // Delete from Cloudflare Images
  const deleteUrl = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${imageRecord.cloudflareId}`;
  const deleteResponse = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${env.CF_IMAGES_TOKEN}`,
    },
  });

  if (!deleteResponse.ok) {
    console.error(`Failed to delete from Cloudflare Images: ${deleteResponse.status}`);
    // Continue with DB deletion even if CF deletion fails
  }

  // Delete from database
  await db.delete(images).where(images.id.eq(imageId));
}

/**
 * Get all images for a specific owner (project, floor, or room)
 *
 * @param ownerType - Type of owner
 * @param ownerId - Owner ID
 * @param env - Cloudflare Worker environment
 * @returns Array of image records
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
    .where(images.ownerType.eq(ownerType).and(images.ownerId.eq(ownerId)))
    .all();
}
