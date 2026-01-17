// Geometry primitives
export interface Point {
  x: number;
  y: number;
}

// Wall representation
export interface Wall {
  id: string;
  start: Point;
  end: Point;
  type: 'wall' | 'window' | 'door' | 'opening';
  isExternal: boolean;
  isLoadBearing?: boolean;
}

// Room representation
export interface Room {
  id: string;
  name: string;
  labelPosition: Point;
  approxArea?: number;
}

// Digitized floor plan data
export interface FloorPlanData {
  walls: Wall[];
  rooms: Room[];
  width: number;
  height: number;
}

// Remodel zone selection
export interface RemodelZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Scale calibration data
export interface ScaleData {
  pixelsPerFoot: number;
  calibrated: boolean;
}

// Calibration ruler data
export interface RulerData {
  start: Point;
  end: Point;
}

// Version history entry
export interface HistoryEntry {
  id: string;
  timestamp: number;
  description: string;
  data: FloorPlanData;
  visualizations?: {
    render3D?: string; // Base64 image
    interior?: string; // Base64 image
    edited?: string; // Base64 image
    video?: string; // Base64 image/video
  };
}

// Floor data structure
export interface Floor {
  id: string;
  name: string;
  imageSrc: string;
  imageDims: { width: number; height: number };
  data: FloorPlanData | null;
  scaleData: ScaleData;
  remodelZone: RemodelZone | null;
  calibrationRuler: RulerData;
  history: HistoryEntry[];
  currentVersionId: string;
}

// Application steps
export enum AppStep {
  PROJECT_OVERVIEW = 'PROJECT_OVERVIEW',
  UPLOAD_FLOOR = 'UPLOAD_FLOOR',
  DIGITIZING = 'DIGITIZING',
  CALIBRATION = 'CALIBRATION',
  REMODEL = 'REMODEL',
  VISUALIZE = 'VISUALIZE',
}

// Canvas interaction modes
export type CanvasMode = 'VIEW' | 'CALIBRATE' | 'ZONE' | 'EDIT';

// Chat message
export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}

// Generation params for visual pipeline
export interface VisualParams {
  perspective: 'isometric' | 'top-down';
  style: string;
  roomName: string;
  instruction: string;
}
