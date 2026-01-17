/**
 * Unified Gemini AI Service
 * Combines functionality from Source A (visuals) and Source B (technical)
 */

import { GoogleGenAI, Type, Schema } from '@google/genai';
import { FloorPlanData, RemodelZone } from '@/types';

// Model configurations
const MODEL_VISION = 'gemini-3-flash-preview';
const MODEL_REASONING = 'gemini-3-pro-preview';
const MODEL_IMAGE_GEN = 'gemini-2.5-flash-image-preview';

// Prompts for visual generation (Source A)
export const PROMPTS = {
  generate3D: {
    title: 'Generate 3D View',
    template:
      'Turn this technical 2D floorplan into a high-fidelity {perspective} 3D floorplan render. Style: {style}. Keep the exact layout, wall positions, and room dimensions identical to the source image. Extrude the walls and add flooring textures. Light the scene softly from the top-left.',
    defaults: { perspective: 'isometric', style: 'photorealistic modern' },
  },
  interior: {
    title: 'Generate Interior View',
    template:
      "Using the provided 3D rendering as a layout guide, create a photorealistic interior photograph. The photo should be from a first-person perspective, as if a person is standing in the doorway looking into the {room_name}. Capture the sense of entering the room for the first time. Ensure the lighting and furniture placement are consistent with the 3D model.",
    defaults: { room_name: 'Living Room' },
  },
  edit: {
    title: 'Edit Design',
    template:
      'Using the provided image, {instruction}. Keep everything else in the image exactly the same, preserving the original lighting, perspective, and structural details.',
    defaults: { instruction: 'Add a modern red leather sofa to the center' },
  },
  video: {
    title: 'Generate Video',
    template: 'A slow, gentle panning shot of the room.',
    defaults: {},
  },
};

// Schema for digitization (Source B)
const DIGITIZER_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    walls: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          start: {
            type: Type.OBJECT,
            properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } },
          },
          end: {
            type: Type.OBJECT,
            properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } },
          },
          type: { type: Type.STRING, enum: ['wall', 'window', 'door', 'opening'] },
          isExternal: { type: Type.BOOLEAN },
        },
        required: ['id', 'start', 'end', 'type', 'isExternal'],
      },
    },
    rooms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          labelPosition: {
            type: Type.OBJECT,
            properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER } },
          },
        },
      },
    },
    width: { type: Type.NUMBER },
    height: { type: Type.NUMBER },
  },
  required: ['walls', 'rooms', 'width', 'height'],
};

const DIGITIZER_SYSTEM_PROMPT = `
You are an expert architectural digitizer. 
Your job is to analyze a SINGLE floor plan image and convert it into a vector representation.

CRITICAL INSTRUCTIONS:
1. Coordinate System: Use a NORMALIZED coordinate system (0-1000).
2. Walls: 
   - Trace EVERY visible line that represents a wall. 
   - You MUST capture all internal partitions, not just the outline.
   - Mark 'isExternal' as true ONLY for the building envelope.
3. Completeness: 
   - Ensure all rooms are fully enclosed. 
   - Do not miss small walls like entryways, closet dividers, or bay windows.
4. Openings: 
   - Identify windows (thin lines/gaps in walls).
   - Identify doors (arcs or gaps).
5. Output: Return a JSON with precise start/end coordinates.
`;

const REMODEL_SYSTEM_PROMPT = `
You are an expert Architect AI specializing in home renovations.
Your task is to modify a floor plan JSON based on a user's request.

INPUTS:
1. Current Floor Plan JSON (Walls, Rooms).
2. A 'Remodel Zone' (bounding box x,y,w,h).
3. A User Request (e.g., "Remove the closet").

CRITICAL RULES:
1. **EXTERIOR INTEGRITY**: NEVER remove or move walls marked 'isExternal': true.
2. **ZONE CONFINEMENT**: Do NOT touch any wall that is completely outside the 'Remodel Zone'.

DESTRUCTIVE EDITING RULES (Very Important):
1. If the user asks to "Remove", "Delete", "Open up", or "Combine":
   - You MUST DELETE the internal walls that separate the mentioned spaces.
   - If removing a "closet" (often labeled CL, WIC, Storage), you MUST delete the walls forming that small enclosure.
   - Do not just merge the room labels; you must physically remove the 'wall' entries from the JSON array.
   - Replace removed walls with nothing (for open space) or 'opening' type if a partial header remains.

CONSTRUCTIVE EDITING RULES:
1. If adding walls, ensure they snap to existing walls (share coordinates).
2. Maintain straight lines (axis-aligned) unless specifically asked for curves.

Output the COMPLETE updated floor plan JSON.
`;

/**
 * Get the Gemini API key from environment variables
 * In Cloudflare deployment, the worker injects GEMINI_API_KEY as an env var at runtime
 */
async function getApiKey(): Promise<string> {
  // Environment variables - works in both client and server contexts
  const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Please configure the environment variable.');
  }
  return apiKey;
}

/**
 * Convert a File to base64 string (without data URL prefix)
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64 = base64String.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Helper function for image generation API calls
 * Reduces code duplication across generate3D, visualizeInterior, editDesign, and generateVideoFrame
 */
async function generateImageFromPrompt(
  imageBase64: string,
  prompt: string
): Promise<string> {
  const apiKey = await getApiKey();
  
  // Clean base64 string
  const cleanBase64 = imageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_IMAGE_GEN}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: 'image/png', data: cleanBase64 } },
            ],
          },
        ],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  const data = await response.json();
  const candidates = data.candidates;
  if (candidates && candidates.length > 0) {
    const parts = candidates[0].content.parts;
    const imagePart = parts.find((p: Record<string, unknown>) => p.inlineData);
    if (imagePart) {
      return `data:image/png;base64,${imagePart.inlineData.data}`;
    }
  }
  throw new Error('No image generated');
}

/**
 * Digitize a floor plan image into vector JSON (Source B functionality)
 * @param imageBase64 - Base64 encoded image
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @returns FloorPlanData with walls and rooms
 */
export async function digitizePlan(
  imageBase64: string,
  width: number,
  height: number
): Promise<FloorPlanData> {
  const apiKey = await getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: MODEL_VISION,
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
        {
          text: 'Analyze this floor plan and extract the vector data. Map the image corners to 0,0 (top-left) and 1000,1000 (bottom-right).',
        },
      ],
    },
    config: {
      systemInstruction: DIGITIZER_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: DIGITIZER_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) throw new Error('No response from AI');
  const data = JSON.parse(text) as FloorPlanData;

  // Scale coordinates from 0-1000 back to actual image dimensions
  const scaleX = width / 1000;
  const scaleY = height / 1000;

  if (data.walls) {
    data.walls.forEach((wall) => {
      if (wall.start) {
        wall.start.x = wall.start.x * scaleX;
        wall.start.y = wall.start.y * scaleY;
      }
      if (wall.end) {
        wall.end.x = wall.end.x * scaleX;
        wall.end.y = wall.end.y * scaleY;
      }
    });
  }

  if (data.rooms) {
    data.rooms.forEach((room) => {
      if (room.labelPosition) {
        room.labelPosition.x = room.labelPosition.x * scaleX;
        room.labelPosition.y = room.labelPosition.y * scaleY;
      }
    });
  }

  data.width = width;
  data.height = height;

  return data;
}

/**
 * Generate a 3D render from a 2D floor plan (Source A functionality)
 * @param imageBase64 - Base64 encoded floor plan image
 * @param perspective - 'isometric' or 'top-down'
 * @param style - Style description (e.g., 'photorealistic modern')
 * @returns Base64 encoded 3D render image
 */
export async function generate3D(
  imageBase64: string,
  perspective: string = 'isometric',
  style: string = 'photorealistic modern'
): Promise<string> {
  const prompt = PROMPTS.generate3D.template.replace('{perspective}', perspective).replace('{style}', style);
  return generateImageFromPrompt(imageBase64, prompt);
}

/**
 * Compute a remodel based on user request (Source B functionality with Chain-of-Thought)
 * @param currentPlan - Current floor plan data
 * @param zone - Remodel zone bounds
 * @param userPrompt - User's remodeling request
 * @returns Updated FloorPlanData
 */
export async function computeRemodel(
  currentPlan: FloorPlanData,
  zone: RemodelZone,
  userPrompt: string
): Promise<FloorPlanData> {
  const apiKey = await getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    CURRENT PLAN JSON:
    ${JSON.stringify(currentPlan)}

    REMODEL ZONE:
    x: ${zone.x}, y: ${zone.y}, width: ${zone.width}, height: ${zone.height}

    USER REQUEST:
    ${userPrompt}

    Generate the new floor plan layout strictly adhering to the constraints.
  `;

  const response = await ai.models.generateContent({
    model: MODEL_REASONING,
    contents: {
      parts: [{ text: prompt }],
    },
    config: {
      systemInstruction: REMODEL_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema: DIGITIZER_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) throw new Error('No response from AI');
  return JSON.parse(text) as FloorPlanData;
}

/**
 * Generate a first-person interior visualization (Source A functionality)
 * @param imageBase64 - Base64 encoded 3D render or floor plan image
 * @param roomName - Name of the room to focus on
 * @returns Base64 encoded interior photo
 */
export async function visualizeInterior(
  imageBase64: string,
  roomName: string = 'Living Room'
): Promise<string> {
  const prompt = PROMPTS.interior.template.replace('{room_name}', roomName);
  return generateImageFromPrompt(imageBase64, prompt);
}

/**
 * Edit an existing design image (Source A functionality)
 * @param imageBase64 - Base64 encoded image to edit
 * @param instruction - Editing instruction
 * @returns Base64 encoded edited image
 */
export async function editDesign(imageBase64: string, instruction: string): Promise<string> {
  const prompt = PROMPTS.edit.template.replace('{instruction}', instruction);
  return generateImageFromPrompt(imageBase64, prompt);
}

/**
 * Generate a cinematic video frame (Source A functionality)
 * Note: Actual video generation requires specialized API access
 * @param imageBase64 - Base64 encoded final design image
 * @returns Base64 encoded cinematic frame image
 */
export async function generateVideoFrame(imageBase64: string): Promise<string> {
  const prompt = `Cinematic still frame: ${PROMPTS.video.template} High motion blur, 4k.`;
  return generateImageFromPrompt(imageBase64, prompt);
}
