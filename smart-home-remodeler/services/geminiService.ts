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
  userPrompt: string
): Promise<FloorPlanData> => {
  if (!process.env.API_KEY) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // For remodeling, we can keep the current scale as the "truth"
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
      parts: [{ text: prompt }]
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