/**
 * Frontend API Client for Smart Home Remodeler
 * Type-safe fetch wrapper for backend API endpoints
 */

/**
 * Base API configuration
 */
const API_BASE = '/api';

/**
 * Type definitions for API requests and responses
 */

// Project types
export interface Project {
  id: string;
  name: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectWithFloors extends Project {
  floors: FloorWithRooms[];
}

// Floor types
export interface Floor {
  id: string;
  projectId: string;
  name: string;
  scaleRatio: number | null;
  isCalibrated: boolean;
  orientationData: {
    frontDoorId?: string;
    garageRect?: { x: number; y: number; width: number; height: number };
    garageWidth?: number;
    frontAngle?: number;
  } | null;
  isUnderground: boolean;
  stairLocation: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FloorWithRooms extends Floor {
  rooms: Room[];
}

// Room types
export interface Room {
  id: string;
  floorId: string;
  name: string;
  widthFt: number | null;
  lengthFt: number | null;
  approxArea: number | null;
  polygonJson: Array<{ x: number; y: number }> | null;
  labelPosition: { x: number; y: number } | null;
  remodelGoals: string | null;
  remodelGoalsJson: {
    description?: string;
    budget?: number;
    style?: string;
    priorities?: string[];
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

// Image types
export interface Image {
  id: string;
  ownerType: 'project' | 'floor' | 'room';
  ownerId: string;
  cloudflareId: string;
  publicUrl: string;
  type:
    | 'blueprint_original'
    | 'blueprint_processed'
    | 'room_listing_photo'
    | 'render_3d'
    | 'render_interior'
    | 'render_edited'
    | 'render_video_frame';
  promptUsed: string | null;
  generationModel: string | null;
  width: number | null;
  height: number | null;
  mimeType: string;
  fileSize: number | null;
  createdAt: Date;
}

// Agent log types
export interface AgentLog {
  id: string;
  floorId: string;
  stepName: string;
  stepIndex: number | null;
  thoughtProcess: string | null;
  actionTaken: string;
  inputData: Record<string, unknown> | null;
  outputData: Record<string, unknown> | null;
  status: 'success' | 'error' | 'warning';
  errorMessage: string | null;
  timestamp: Date;
}

/**
 * Generic API response wrapper
 */
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Helper function to make API calls
 */
async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Project API methods
 */
export const projectsApi = {
  /**
   * Initialize a new project
   */
  async init(name: string, userId?: string): Promise<{ project: Project }> {
    return apiCall('/projects/init', {
      method: 'POST',
      body: JSON.stringify({ name, userId }),
    });
  },

  /**
   * Get project by ID with all floors and rooms
   */
  async get(projectId: string): Promise<{ project: ProjectWithFloors }> {
    return apiCall(`/projects/${projectId}`, {
      method: 'GET',
    });
  },
};

/**
 * Floor API methods
 */
export const floorsApi = {
  /**
   * Create a new floor
   */
  async create(
    projectId: string,
    name: string,
    isUnderground?: boolean,
    sortOrder?: number
  ): Promise<{ floor: Floor }> {
    return apiCall('/floors/create', {
      method: 'POST',
      body: JSON.stringify({ projectId, name, isUnderground, sortOrder }),
    });
  },

  /**
   * Update floor data (scale, orientation, stair location)
   */
  async sync(
    floorId: string,
    data: {
      scaleRatio?: number;
      isCalibrated?: boolean;
      orientationData?: {
        frontDoorId?: string;
        garageRect?: { x: number; y: number; width: number; height: number };
        garageWidth?: number;
        frontAngle?: number;
      };
      stairLocation?: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }
  ): Promise<{ floorId: string }> {
    return apiCall(`/floors/${floorId}/sync`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

/**
 * Room API methods
 */
export const roomsApi = {
  /**
   * Create or update a room
   */
  async upsert(room: {
    id?: string;
    floorId: string;
    name: string;
    widthFt?: number;
    lengthFt?: number;
    approxArea?: number;
    polygonJson?: Array<{ x: number; y: number }>;
    labelPosition?: { x: number; y: number };
    remodelGoals?: string;
    remodelGoalsJson?: {
      description?: string;
      budget?: number;
      style?: string;
      priorities?: string[];
    };
  }): Promise<{ roomId: string; room?: Room }> {
    return apiCall('/rooms', {
      method: 'POST',
      body: JSON.stringify(room),
    });
  },
};

/**
 * Image API methods
 */
export const imagesApi = {
  /**
   * Upload a base64 image to Cloudflare Images
   */
  async upload(data: {
    base64Data: string;
    ownerType: 'project' | 'floor' | 'room';
    ownerId: string;
    type:
      | 'blueprint_original'
      | 'blueprint_processed'
      | 'room_listing_photo'
      | 'render_3d'
      | 'render_interior'
      | 'render_edited'
      | 'render_video_frame';
    promptUsed?: string;
    generationModel?: string;
    width?: number;
    height?: number;
  }): Promise<{
    id: string;
    cloudflareId: string;
    publicUrl: string;
    variants: string[];
  }> {
    return apiCall('/images/upload', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get all images for a specific owner
   */
  async getForOwner(
    ownerType: 'project' | 'floor' | 'room',
    ownerId: string
  ): Promise<{ images: Image[] }> {
    return apiCall(`/images/${ownerType}/${ownerId}`, {
      method: 'GET',
    });
  },
};

/**
 * Visual generation API methods
 */
export const visualsApi = {
  /**
   * Generate a visual (3D render, interior, etc.) using Gemini
   * and upload the result to Cloudflare Images
   */
  async generate(data: {
    imageBase64: string;
    prompt: string;
    generationType: 'render_3d' | 'render_interior' | 'render_edited' | 'render_video_frame';
    ownerId: string;
    ownerType: 'floor' | 'room';
    model?: string;
  }): Promise<{
    imageUrl: string;
    imageId: string;
    base64: string;
  }> {
    return apiCall('/generate/visual', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

/**
 * Agent logs API methods
 */
export const logsApi = {
  /**
   * Create an agent log entry
   */
  async create(log: {
    floorId: string;
    stepName: string;
    stepIndex?: number;
    thoughtProcess?: string;
    actionTaken: string;
    inputData?: Record<string, unknown>;
    outputData?: Record<string, unknown>;
    status?: 'success' | 'error' | 'warning';
    errorMessage?: string;
  }): Promise<{ logId: string }> {
    return apiCall('/logs', {
      method: 'POST',
      body: JSON.stringify(log),
    });
  },

  /**
   * Get all logs for a floor
   */
  async getForFloor(floorId: string): Promise<{ logs: AgentLog[] }> {
    return apiCall(`/logs/${floorId}`, {
      method: 'GET',
    });
  },
};

/**
 * Floor plan snapshot API methods
 */
export const snapshotsApi = {
  /**
   * Save a floor plan snapshot for version history
   */
  async create(snapshot: {
    floorId: string;
    versionNumber: number;
    description?: string;
    planData: {
      walls: Array<{
        id: string;
        start: { x: number; y: number };
        end: { x: number; y: number };
        type: 'wall' | 'window' | 'door' | 'opening';
        doorType?: string;
        isExternal: boolean;
        isLoadBearing?: boolean;
      }>;
      rooms: Array<{
        id: string;
        name: string;
        labelPosition: { x: number; y: number };
        approxArea?: number;
        dimensions?: string;
      }>;
      width: number;
      height: number;
    };
    remodelZone?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }): Promise<{ snapshotId: string }> {
    return apiCall('/snapshots', {
      method: 'POST',
      body: JSON.stringify(snapshot),
    });
  },
};
