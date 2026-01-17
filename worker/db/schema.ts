/**
 * Drizzle ORM Schema for Smart Home Remodeler
 *
 * Database structure:
 * - Projects contain Floors
 * - Floors contain Rooms
 * - Images attach to Projects, Floors, or Rooms (polymorphic)
 * - Agent Logs track AI decisions for each Floor
 * - Floor Plan Snapshots provide version history
 */

import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

/**
 * Projects - Top-level container for remodeling projects
 */
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  userId: text('user_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Floors - Individual levels within a building (main floor, basement, etc.)
 */
export const floors = sqliteTable('floors', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  scaleRatio: real('scale_ratio'), // Calibration: pixels per foot
  isCalibrated: integer('is_calibrated', { mode: 'boolean' }).default(false),

  // Compass orientation and landmark positions
  orientationData: text('orientation_data', { mode: 'json' }).$type<{
    frontDoorId?: string;
    garageRect?: { x: number; y: number; width: number; height: number };
    garageWidth?: number;
    frontAngle?: number; // Degrees from north
  }>(),

  isUnderground: integer('is_underground', { mode: 'boolean' }).default(false),

  // Staircase bounding box for multi-floor navigation
  stairLocation: text('stair_location', { mode: 'json' }).$type<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>(),

  sortOrder: integer('sort_order').notNull().default(0), // Vertical ordering (0=main, 1=upper, -1=basement)
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Rooms - Spaces within a floor with dimensions, boundaries, and remodel goals
 */
export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  floorId: text('floor_id')
    .notNull()
    .references(() => floors.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),

  // Physical dimensions derived from calibration
  widthFt: real('width_ft'),
  lengthFt: real('length_ft'),
  approxArea: real('approx_area'),

  // Vector boundary (array of {x, y} points forming closed polygon)
  polygonJson: text('polygon_json', { mode: 'json' }).$type<Array<{ x: number; y: number }>>(),

  // Canvas label position
  labelPosition: text('label_position', { mode: 'json' }).$type<{ x: number; y: number }>(),

  // User's remodeling intentions (free-text or structured)
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
 * Images - Metadata for all images stored in Cloudflare Images
 * Supports blueprints, photos, and AI-generated renders
 */
export const images = sqliteTable('images', {
  id: text('id').primaryKey(),

  // Polymorphic association: can belong to project, floor, or room
  ownerType: text('owner_type', { enum: ['project', 'floor', 'room'] }).notNull(),
  ownerId: text('owner_id').notNull(),

  // Cloudflare Images identifiers
  cloudflareId: text('cloudflare_id').notNull().unique(),
  publicUrl: text('public_url').notNull(),

  // Image classification
  type: text('type', {
    enum: [
      'blueprint_original',      // User-uploaded floor plan
      'blueprint_processed',     // AI-digitized vector version
      'room_listing_photo',      // Pre-renovation photo for context
      'render_3d',              // Isometric/top-down 3D visualization
      'render_interior',        // First-person room view
      'render_edited',          // User-requested design modification
      'render_video_frame',     // Cinematic walkthrough frame
    ],
  }).notNull(),

  // AI generation metadata (null for user-uploaded images)
  promptUsed: text('prompt_used'),
  generationModel: text('generation_model'),

  // Image properties
  width: integer('width'),
  height: integer('height'),
  mimeType: text('mime_type').notNull().default('image/png'),
  fileSize: integer('file_size'),

  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Agent Logs - Audit trail of AI decisions during the wizard workflow
 * Records reasoning, actions, and outcomes for debugging and transparency
 */
export const agentLogs = sqliteTable('agent_logs', {
  id: text('id').primaryKey(),
  floorId: text('floor_id')
    .notNull()
    .references(() => floors.id, { onDelete: 'cascade' }),

  // Workflow context
  stepName: text('step_name').notNull(),
  stepIndex: integer('step_index'),

  // AI decision chain
  thoughtProcess: text('thought_process'),
  actionTaken: text('action_taken').notNull(),

  // Execution context
  inputData: text('input_data', { mode: 'json' }).$type<Record<string, unknown>>(),
  outputData: text('output_data', { mode: 'json' }).$type<Record<string, unknown>>(),

  // Outcome tracking
  status: text('status', { enum: ['success', 'error', 'warning'] })
    .notNull()
    .default('success'),
  errorMessage: text('error_message'),

  timestamp: integer('timestamp', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Floor Plan Snapshots - Version history enabling rollback and comparison
 * Captures complete floor plan state at key milestones
 */
export const floorPlanSnapshots = sqliteTable('floor_plan_snapshots', {
  id: text('id').primaryKey(),
  floorId: text('floor_id')
    .notNull()
    .references(() => floors.id, { onDelete: 'cascade' }),

  // Version tracking
  versionNumber: integer('version_number').notNull(),
  description: text('description'),

  // Complete vector floor plan data
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

  // Active remodel zone when snapshot was taken
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
 * Exported TypeScript types for type-safe database operations
 * Inferred from schema definitions by Drizzle ORM
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
