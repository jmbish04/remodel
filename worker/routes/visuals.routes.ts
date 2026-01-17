/**
 * AI visual generation routes
 */

import { Hono } from 'hono';
import { uploadBase64Image } from '../services/imageService';
import type { Env } from '../types';

const visualsRouter = new Hono<{ Bindings: Env }>();

visualsRouter.post('/visual', async (c) => {
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

export default visualsRouter;
