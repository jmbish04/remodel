/**
 * Frontend API Client
 *
 * Type-safe client library for communicating with the Hono API backend.
 * All functions return strongly-typed responses and handle JSON serialization.
 */

const API_BASE = '/api';

// ============================================================================
// Type Definitions - Database Entity Models
// ============================================================================

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

// ============================================================================
// Internal Utilities
// ============================================================================

/**
 * Generic wrapper for all API fetch calls
 * Handles JSON serialization, error parsing, and type safety
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
    const errorData = await response.json().catch(() => ({})) as any;
    throw new Error(errorData.error || `API error: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// API Namespaces - Exported Client Methods
// ============================================================================

/**
 * Project management operations
 */
export const projectsApi = {
  /**
   * Creates a new remodeling project
   */
  async init(name: string, userId?: string): Promise<{ project: Project }> {
    return apiCall('/projects/init', {
      method: 'POST',
      body: JSON.stringify({ name, userId }),
    });
  },

  /**
   * Retrieves a project with all nested floors and rooms
   */
  async get(projectId: string): Promise<{ project: ProjectWithFloors }> {
    return apiCall(`/projects/${projectId}`, {
      method: 'GET',
    });
  },
};

/**
 * Floor management operations
 */
export const floorsApi = {
  /**
   * Creates a new floor within a project
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
   * Syncs floor calibration data (scale ratio, orientation, stairs)
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
 * Room management operations
 */
export const roomsApi = {
  /**
   * Creates or updates a room with dimensions and remodel goals
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
 * Image upload and retrieval operations
 */
export const imagesApi = {
  /**
   * Uploads an image to Cloudflare Images CDN
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
   * Retrieves all images for a specific owner (project, floor, or room)
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
 * AI visual generation operations
 */
export const visualsApi = {
  /**
   * Generates AI visuals (3D renders, interior views, etc.) via Gemini and uploads to CDN
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
 * Agent logging operations (audit trail)
 */
export const logsApi = {
  /**
   * Records an AI agent decision and action
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
   * Retrieves all agent logs for a floor
   */
  async getForFloor(floorId: string): Promise<{ logs: AgentLog[] }> {
    return apiCall(`/logs/${floorId}`, {
      method: 'GET',
    });
  },
};

/**
 * Floor plan version history operations
 */
export const snapshotsApi = {
  /**
   * Saves a complete floor plan snapshot for rollback capability
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
