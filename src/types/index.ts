// Geometry primitives
export interface Point {
  x: number;
  y: number;
}

// Rectangle primitive for wizard tools
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Orientation data for compass and front door
export interface OrientationData {
  frontDoorId?: string;
  garageRect?: Rect;
  garageWidth?: number; // in feet, calculated from pixels
  frontAngle?: number; // 0-360 degrees
}

// Wall representation
export interface Wall {
  id: string;
  start: Point;
  end: Point;
  type: 'wall' | 'window' | 'door' | 'opening';
  doorType?: 'entry' | 'sliding' | 'french' | 'pocket';
  isExternal: boolean;
  isLoadBearing?: boolean;
}

// Room representation
export interface Room {
  id: string;
  name: string;
  labelPosition: Point;
  approxArea?: number;
  dimensions?: string; // e.g. "12' x 14'"
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
  garageRuler?: RulerData;

  // Wizard Specific Data
  stairLocation?: Rect;
  orientation?: OrientationData;
  isUnderground?: boolean;

  // Version Control
  history: HistoryEntry[];
  currentVersionId: string;
}

// Application steps
export enum AppStep {
  // Initial and Setup
  PROJECT_OVERVIEW = 'PROJECT_OVERVIEW',
  UPLOAD_FLOOR = 'UPLOAD_FLOOR',
  DIGITIZING = 'DIGITIZING',

  // Wizard Flow
  CALIBRATION = 'CALIBRATION',
  STAIR_MARKING = 'STAIR_MARKING',
  CORRECTION_DOORS = 'CORRECTION_DOORS',
  CORRECTION_WALLS = 'CORRECTION_WALLS',
  STRUCTURAL_ID = 'STRUCTURAL_ID',
  EXTERIOR_CHECK = 'EXTERIOR_CHECK',
  LABEL_REVIEW = 'LABEL_REVIEW',
  SCALE_VERIFICATION_ROOMS = 'SCALE_VERIFICATION_ROOMS',
  ORIENTATION = 'ORIENTATION',

  // Final States
  REMODEL = 'REMODEL',
  VISUALIZE = 'VISUALIZE',
}

// Canvas interaction modes - includes AppStep values for wizard modes
export type CanvasMode = AppStep | 'CALIBRATE' | 'ZONE';

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
