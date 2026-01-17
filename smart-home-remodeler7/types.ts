export interface Point {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  start: Point;
  end: Point;
  type: 'wall' | 'window' | 'door' | 'opening';
  doorType?: 'entry' | 'sliding' | 'french' | 'pocket';
  isExternal: boolean;
  isLoadBearing?: boolean;
}

export interface Room {
  id: string;
  name: string;
  labelPosition: Point;
  approxArea?: number;
  dimensions?: string; // e.g. "12' x 14'"
}

export interface FloorPlanData {
  walls: Wall[];
  rooms: Room[];
  width: number;
  height: number;
}

export interface RemodelZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScaleData {
  pixelsPerFoot: number;
  calibrated: boolean;
}

export interface RulerData {
  start: Point;
  end: Point;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OrientationData {
  frontDoorId?: string;
  garageRect?: Rect;
  garageWidth?: number; // in feet, calculated from pixels
  frontAngle?: number; // 0-360 degrees
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  description: string;
  data: FloorPlanData;
  cloudUrl?: string;
}

export interface VisualAsset {
  id: string;
  type: '3d-iso' | 'interior' | 'cinematic';
  url: string; // base64 or cloud url
  prompt: string;
  roomId?: string;
  timestamp: number;
}

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
  
  // Visuals
  visuals: VisualAsset[];
}

export enum AppStep {
  // Wizard Flow
  ONBOARDING = 'ONBOARDING',
  UPLOAD_LOOP = 'UPLOAD_LOOP',
  DIGITIZING = 'DIGITIZING',
  SCALE_VERIFICATION = 'SCALE_VERIFICATION',
  STAIR_MARKING = 'STAIR_MARKING',
  CORRECTION_DOORS = 'CORRECTION_DOORS',
  CORRECTION_WALLS = 'CORRECTION_WALLS',
  STRUCTURAL_ID = 'STRUCTURAL_ID',
  EXTERIOR_CHECK = 'EXTERIOR_CHECK',
  LABEL_REVIEW = 'LABEL_REVIEW',
  SCALE_VERIFICATION_ROOMS = 'SCALE_VERIFICATION_ROOMS',
  ORIENTATION = 'ORIENTATION',
  
  // Final State
  REMODEL = 'REMODEL',
}