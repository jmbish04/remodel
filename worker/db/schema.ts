/**
 * Drizzle ORM Schema for Smart Home Remodeler
 * Tracks the full lifecycle: Projects -> Floors -> Rooms -> Images -> Agent Logs
 */

import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/**
 * Projects table - Top-level container for user projects
 */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  userId: text('user_id').notNull(), // For future multi-user support
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Floors table - Each floor in a building
 */
export const floors = sqliteTable('floors', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // e.g., "Main Floor", "Basement"
  scaleRatio: real('scale_ratio'), // pixels per foot
  isCalibrated: integer('is_calibrated', { mode: 'boolean' }).default(false),

  // Orientation data stored as JSON
  orientationData: text('orientation_data', { mode: 'json' }).$type<{
    frontDoorId?: string;
    garageRect?: { x: number; y: number; width: number; height: number };
    garageWidth?: number;
    frontAngle?: number;
  }>(),

  isUnderground: integer('is_underground', { mode: 'boolean' }).default(false),

  // Store stair location as JSON
  stairLocation: text('stair_location', { mode: 'json' }).$type<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>(),

  sortOrder: integer('sort_order').notNull().default(0), // For ordering floors
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Rooms table - Individual rooms within floors
 * Stores both the vector polygon data and physical dimensions
 */
export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  floorId: text('floor_id')
    .notNull()
    .references(() => floors.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // e.g., "Living Room", "Kitchen"

  // Physical dimensions
  widthFt: real('width_ft'), // Width in feet
  lengthFt: real('length_ft'), // Length in feet
  approxArea: real('approx_area'), // Approximate square footage

  // Vector polygon data (array of {x, y} points)
  polygonJson: text('polygon_json', { mode: 'json' }).$type<Array<{ x: number; y: number }>>(),

  // Label position for canvas rendering
  labelPosition: text('label_position', { mode: 'json' }).$type<{ x: number; y: number }>(),

  // Remodel goals and context (can be text or structured JSON)
  remodelGoals: text('remodel_goals'),
  remodelGoalsJson: text('remodel_goals_json', { mode: 'json' }).$type<{
    description?: string;
    budget?: number;
    style?: string;
    priorities?: string[];
  }>(),

  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Images table - All images (blueprints, photos, renders)
 * Unified table for all image types with Cloudflare Images integration
 */
export const images = sqliteTable('images', {
  id: text('id').primaryKey(),

  // Polymorphic owner (can be project, floor, or room)
  ownerType: text('owner_type', { enum: ['project', 'floor', 'room'] }).notNull(),
  ownerId: text('owner_id').notNull(), // References projects.id, floors.id, or rooms.id

  // Cloudflare Images data
  cloudflareId: text('cloudflare_id').notNull().unique(), // CF Images ID
  publicUrl: text('public_url').notNull(), // Full public URL

  // Image type classification
  type: text('type', {
    enum: [
      'blueprint_original',      // Original uploaded blueprint
      'blueprint_processed',     // AI-processed/digitized blueprint
      'room_listing_photo',      // Pre-remodel "current state" photo
      'render_3d',              // Generated 3D render
      'render_interior',        // First-person interior render
      'render_edited',          // Edited design render
      'render_video_frame',     // Video frame from walkthrough
    ],
  }).notNull(),

  // Generation metadata
  promptUsed: text('prompt_used'), // Prompt used for AI generation (if applicable)
  generationModel: text('generation_model'), // e.g., "gemini-2.5-flash-image-preview"

  // Image dimensions
  width: integer('width'),
  height: integer('height'),

  // File metadata
  mimeType: text('mime_type').notNull().default('image/png'),
  fileSize: integer('file_size'), // Size in bytes

  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Agent Logs table - Tracks AI agent thought process and actions
 * For auditing and debugging the wizard workflow
 */
export const agentLogs = sqliteTable('agent_logs', {
  id: text('id').primaryKey(),
  floorId: text('floor_id')
    .notNull()
    .references(() => floors.id, { onDelete: 'cascade' }),

  // Wizard step context
  stepName: text('step_name').notNull(), // e.g., "CALIBRATION", "DIGITIZING", "ORIENTATION"
  stepIndex: integer('step_index'), // Numeric step order

  // Agent reasoning
  thoughtProcess: text('thought_process'), // What the agent is thinking
  actionTaken: text('action_taken').notNull(), // What action was executed

  // Additional context
  inputData: text('input_data', { mode: 'json' }).$type<Record<string, unknown>>(), // Input parameters
  outputData: text('output_data', { mode: 'json' }).$type<Record<string, unknown>>(), // Result data

  // Success/error tracking
  status: text('status', { enum: ['success', 'error', 'warning'] })
    .notNull()
    .default('success'),
  errorMessage: text('error_message'),

  timestamp: integer('timestamp', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Floor Plan Data table - Stores complete floor plan JSON snapshots
 * For version history and rollback capability
 */
export const floorPlanSnapshots = sqliteTable('floor_plan_snapshots', {
  id: text('id').primaryKey(),
  floorId: text('floor_id')
    .notNull()
    .references(() => floors.id, { onDelete: 'cascade' }),

  // Version metadata
  versionNumber: integer('version_number').notNull(),
  description: text('description'), // e.g., "After removing closet wall"

  // Complete floor plan JSON (walls, rooms, etc.)
  planData: text('plan_data', { mode: 'json' }).$type<{
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
  }>(),

  // Remodel zone at time of snapshot
  remodelZone: text('remodel_zone', { mode: 'json' }).$type<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>(),

  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * TypeScript types for database entities
 * Drizzle will infer these, but we export them for convenience
 */
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Floor = typeof floors.$inferSelect;
export type NewFloor = typeof floors.$inferInsert;

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;

export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;

export type AgentLog = typeof agentLogs.$inferSelect;
export type NewAgentLog = typeof agentLogs.$inferInsert;

export type FloorPlanSnapshot = typeof floorPlanSnapshots.$inferSelect;
export type NewFloorPlanSnapshot = typeof floorPlanSnapshots.$inferInsert;
