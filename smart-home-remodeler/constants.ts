import { Type, Schema } from "@google/genai";

export const MODEL_VISION = "gemini-3-flash-preview"; 
export const MODEL_REASONING = "gemini-3-pro-preview"; 

export const DIGITIZER_SYSTEM_PROMPT = `
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

export const DIGITIZER_SCHEMA: Schema = {
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
          type: { type: Type.STRING, enum: ["wall", "window", "door", "opening"] },
          isExternal: { type: Type.BOOLEAN },
        },
        required: ["id", "start", "end", "type", "isExternal"],
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
  required: ["walls", "rooms", "width", "height"],
};

export const REMODEL_SYSTEM_PROMPT = `
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