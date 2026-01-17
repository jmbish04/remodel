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
You will be provided with the VISUAL IMAGE of the floor plan and the VECTOR JSON.

INPUTS:
1. Floor Plan Image (Visual Context).
2. Floor Plan JSON (Walls, Rooms).
3. A 'Remodel Zone' (bounding box x,y,w,h).
4. User Request (e.g., "Remove the closet").

CRITICAL RULES:
1. **EXTERIOR INTEGRITY**: NEVER remove or move walls marked 'isExternal': true.
2. **ZONE CONFINEMENT**: Do NOT touch any wall that is completely outside the 'Remodel Zone'.

DESTRUCTIVE EDITING RULES (Very Important):
1. **VISUAL VERIFICATION**: Look at the provided image. If the user says "Remove the closet", identify the small enclosed rectangle labeled "CL", "WIC", or "Closet" within the zone.
2. **EXECUTION**: 
   - You MUST DELETE the internal walls that form that enclosure.
   - If a wall is shared with another room, only remove the segment that encloses the closet/target area.
   - Remove the 'Room' label object for that space.
3. **WALL REMOVAL**: To "remove" a wall, you must strictly exclude it from the 'walls' array in the new JSON.

CONSTRUCTIVE EDITING RULES:
1. If adding walls, ensure they snap to existing walls (share coordinates).
2. Maintain straight lines (axis-aligned) unless specifically asked for curves.

Output the COMPLETE updated floor plan JSON.
`;