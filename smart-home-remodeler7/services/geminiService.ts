import { GoogleGenAI, Type } from "@google/genai";
import { FloorPlanData, RemodelZone } from "../types";
import { DIGITIZER_SCHEMA, DIGITIZER_SYSTEM_PROMPT, MODEL_VISION, MODEL_REASONING, REMODEL_SYSTEM_PROMPT } from "../constants";

// Helper to convert file to base64
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:image/jpeg;base64,")
      const base64 = base64String.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const digitizeFloorPlan = async (imageBase64: string, width: number, height: number): Promise<FloorPlanData> => {
  if (!process.env.API_KEY) throw new Error("API Key missing");
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const response = await ai.models.generateContent({
    model: MODEL_VISION,
    contents: {
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
        { text: `Analyze this floor plan and extract the vector data. Map the image corners to 0,0 (top-left) and 1000,1000 (bottom-right).` }
      ]
    },
    config: {
      systemInstruction: DIGITIZER_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: DIGITIZER_SCHEMA,
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  const data = JSON.parse(text) as FloorPlanData;
  
  // Scale coordinates from 0-1000 back to actual image dimensions
  const scaleX = width / 1000;
  const scaleY = height / 1000;

  if (data.walls) {
    data.walls.forEach(wall => {
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
    data.rooms.forEach(room => {
      if (room.labelPosition) {
        room.labelPosition.x = room.labelPosition.x * scaleX;
        room.labelPosition.y = room.labelPosition.y * scaleY;
      }
    });
  }
  
  data.width = width;
  data.height = height;
  
  return data;
};

export const generateRemodelOptions = async (
  currentPlan: FloorPlanData,
  zone: RemodelZone,
  userPrompt: string,
  imageBase64: string // New param: The visual context is critical for "removing closet"
): Promise<FloorPlanData> => {
  if (!process.env.API_KEY) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // For remodeling, we combine the Visual Image + The JSON Data.
  // This helps the model correlate "Closet" visual to the specific vector lines.
  const promptText = `
    CURRENT PLAN JSON:
    ${JSON.stringify(currentPlan)}

    REMODEL ZONE:
    x: ${zone.x}, y: ${zone.y}, width: ${zone.width}, height: ${zone.height}

    USER REQUEST:
    ${userPrompt}

    Generate the new floor plan layout strictly adhering to the constraints.
  `;

  // We use the original image base64 here. 
  // Optimization: Ideally we crop to the zone, but sending full image with bounding box coords works well for Gemini 1.5/2.0
  const response = await ai.models.generateContent({
    model: MODEL_REASONING, 
    contents: {
      parts: [
          { inlineData: { mimeType: "image/jpeg", data: imageBase64 } },
          { text: promptText }
      ]
    },
    config: {
      systemInstruction: REMODEL_SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: DIGITIZER_SCHEMA, 
    }
  });

   const text = response.text;
  if (!text) throw new Error("No response from AI");
  return JSON.parse(text) as FloorPlanData;
}

// New Visual Generation Service
export const generateVisualisation = async (
    prompt: string, 
    imageBase64: string
): Promise<string> => {
    if (!process.env.API_KEY) throw new Error("API Key missing");

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Using gemini-2.5-flash-image for image-to-image/generation tasks
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [
                { inlineData: { mimeType: "image/png", data: imageBase64 } },
                { text: prompt }
            ]
        },
        config: {
            // Note: responseMimeType is not supported for nano banana series models, so we don't set it.
            // Just requesting the generation.
        }
    });

    // Extract the image from the response parts
    if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return part.inlineData.data;
            }
        }
    }

    throw new Error("No image generated");
};