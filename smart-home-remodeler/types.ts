export interface Point {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  start: Point;
  end: Point;
  type: 'wall' | 'window' | 'door' | 'opening';
  isExternal: boolean;
  isLoadBearing?: boolean;
}

export interface Room {
  id: string;
  name: string;
  labelPosition: Point;
  approxArea?: number;
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

export interface HistoryEntry {
  id: string;
  timestamp: number;
  description: string; // e.g., "Original Upload" or "Remove closet"
  data: FloorPlanData;
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
  
  // Version Control
  history: HistoryEntry[];
  currentVersionId: string;
}

export enum AppStep {
  PROJECT_OVERVIEW = 'PROJECT_OVERVIEW', 
  UPLOAD_FLOOR = 'UPLOAD_FLOOR',
  DIGITIZING = 'DIGITIZING',
  CALIBRATION = 'CALIBRATION',
  REMODEL = 'REMODEL',
}