/**
 * Bidirectional State Adapter for FloorPlanData ↔ react-planner
 *
 * This module bridges two fundamentally different floor plan representations:
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ FloorPlanData (AI-Generated Format)                                 │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ • Simple, flat structure optimized for AI generation               │
 * │ • Walls as independent line segments (start/end points)            │
 * │ • Doors/windows embedded within wall objects                       │
 * │ • Rooms as labeled points with area metadata                       │
 * │ • All coordinates in absolute x/y pixel space                      │
 * └─────────────────────────────────────────────────────────────────────┘
 *                                  ↕
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ ReactPlannerState (Professional CAD Format)                         │
 * ├─────────────────────────────────────────────────────────────────────┤
 * │ • Immutable.js nested structure for efficient rendering            │
 * │ • Scene → Layers → Elements (Vertices, Lines, Holes, Areas, Items) │
 * │ • Vertices shared between connecting walls (graph structure)       │
 * │ • Holes (doors/windows) positioned as offsets along lines          │
 * │ • Areas defined as closed polygons of vertices                     │
 * │ • Properties for thickness, height, materials, etc.                │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Key Algorithms:
 * - Vertex deduplication (merges coincident wall endpoints within tolerance)
 * - Hole-to-line assignment (finds closest wall for door/window placement)
 * - Offset calculation (projects hole position onto line segment 0-1)
 * - Immutable.js state construction (builds nested Map/List structures)
 */

import { Map, List, fromJS } from 'immutable';
import type { FloorPlanData, Wall, Room, Point } from '@/types';

interface VertexData {
  id: string;
  x: number;
  y: number;
  lines: string[];
}

interface LineData {
  id: string;
  type: string;
  vertices: string[];
  holes: string[];
  properties: Map<string, any>;
}

interface HoleData {
  id: string;
  type: string;
  line: string;
  offset: number;
  properties: Map<string, any>;
}

interface AreaData {
  id: string;
  type: string;
  vertices: string[];
  properties: Map<string, any>;
}

/**
 * Generates a collision-resistant unique ID for planner elements.
 *
 * @param prefix - Element type (e.g., 'vertex', 'line', 'hole')
 * @param index - Sequential index for debugging readability
 * @returns Unique identifier like "vertex-5-1705507200000-a1b2c3d4e"
 */
function generateId(prefix: string, index: number): string {
  return `${prefix}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Finds an existing vertex at the given position or creates a new one.
 *
 * In CAD systems, walls that connect must share the same vertex. This function
 * implements vertex deduplication by checking if a vertex already exists within
 * the tolerance radius. This prevents creating duplicate vertices that appear
 * to be at the same location but are treated as separate points.
 *
 * @param vertices - Current vertex collection (Immutable Map)
 * @param point - Desired vertex position
 * @param tolerance - Maximum distance (in pixels) to consider vertices as identical
 * @returns Updated vertices collection and the vertex ID (existing or new)
 */
function findOrCreateVertex(
  vertices: Map<string, VertexData>,
  point: Point,
  tolerance: number = 1
): { vertices: Map<string, VertexData>; vertexId: string } {
  // Search for existing vertex using Euclidean distance
  const existingVertex = vertices.find((v) => {
    const dx = v.x - point.x;
    const dy = v.y - point.y;
    return Math.sqrt(dx * dx + dy * dy) < tolerance;
  });

  if (existingVertex) {
    return { vertices, vertexId: existingVertex.id };
  }

  // No existing vertex found - create new one
  const vertexId = generateId('vertex', vertices.size);
  const newVertex: VertexData = {
    id: vertexId,
    x: point.x,
    y: point.y,
    lines: [],
  };

  return {
    vertices: vertices.set(vertexId, newVertex),
    vertexId,
  };
}

/**
 * Calculates the normalized position of a point along a line segment.
 *
 * This is used to position holes (doors/windows) on walls. The offset represents
 * where along the wall the hole is located, with 0 = start vertex, 1 = end vertex.
 * Uses vector projection: offset = (p - a) · (b - a) / |b - a|²
 *
 * @param lineStart - Start point of the line segment
 * @param lineEnd - End point of the line segment
 * @param point - Point to project onto the line
 * @returns Normalized offset [0-1] clamped to line segment bounds
 */
function calculateOffset(lineStart: Point, lineEnd: Point, point: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lineLength = Math.sqrt(dx * dx + dy * dy);

  // Handle degenerate case (zero-length line)
  if (lineLength === 0) return 0.5;

  // Project point onto line using dot product
  const pointDx = point.x - lineStart.x;
  const pointDy = point.y - lineStart.y;
  const dotProduct = pointDx * dx + pointDy * dy;

  // Normalize and clamp to [0, 1]
  return Math.max(0, Math.min(1, dotProduct / (lineLength * lineLength)));
}

/**
 * Maps Gemini door type abbreviations to react-planner catalog IDs.
 *
 * Gemini uses short codes (E/S/F/P), while react-planner uses descriptive IDs.
 * This ensures doors are rendered with the correct visual representation.
 *
 * @param doorType - Gemini door type ('entry', 'E', 'sliding', 'S', etc.)
 * @returns react-planner catalog ID ('door', 'sliding-door', etc.)
 */
function mapDoorType(doorType?: string): string {
  switch (doorType) {
    case 'entry':
    case 'E':
      return 'door';
    case 'sliding':
    case 'S':
      return 'sliding-door';
    case 'french':
    case 'F':
      return 'door-double';
    case 'pocket':
    case 'P':
      return 'pocket-door';
    default:
      return 'door';
  }
}

/**
 * Transforms AI-generated FloorPlanData into react-planner's internal state.
 *
 * This is the core conversion function that enables the professional floor plan
 * editor to visualize and manipulate AI-generated layouts. The process involves:
 *
 * 1. Wall Processing:
 *    - Convert wall line segments to vertices + lines (CAD graph structure)
 *    - Deduplicate vertices where walls connect
 *    - Assign properties (thickness based on external/internal classification)
 *
 * 2. Opening Processing:
 *    - Extract doors/windows from wall data
 *    - Find which wall line each opening belongs to (spatial proximity search)
 *    - Calculate offset position along the wall (0-1 normalized)
 *    - Create hole objects with proper dimensions and elevation
 *
 * 3. State Construction:
 *    - Build Immutable.js nested structure (Scene → Layer → Elements)
 *    - Configure grid system for visual reference
 *    - Initialize viewport settings
 *
 * @param floorData - AI-generated floor plan with walls, rooms, and dimensions
 * @returns Complete react-planner state ready for rendering and editing
 */
export function adaptGeminiToPlanner(floorData: FloorPlanData): any {
  let vertices = Map<string, VertexData>();
  let lines = Map<string, LineData>();
  let holes = Map<string, HoleData>();
  let areas = Map<string, AreaData>();

  const { walls, rooms, width, height } = floorData;

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 1: Convert Walls to Vertices + Lines
  // ═══════════════════════════════════════════════════════════════════════
  walls.forEach((wall: Wall, index: number) => {
    // Doors and windows are processed separately as holes on walls
    if (wall.type === 'door' || wall.type === 'window') {
      return;
    }

    // Find or create vertices for wall endpoints (deduplication happens here)
    let result1 = findOrCreateVertex(vertices, wall.start);
    vertices = result1.vertices;
    const startVertexId = result1.vertexId;

    let result2 = findOrCreateVertex(vertices, wall.end);
    vertices = result2.vertices;
    const endVertexId = result2.vertexId;

    // Create line connecting the two vertices
    const lineId = wall.id || generateId('line', index);
    const lineType = 'wall'; // All lines are type 'wall' in react-planner

    // External walls are thicker (8" vs 4" in typical construction)
    const thickness = wall.isExternal ? 20 : 10;

    const lineData: LineData = {
      id: lineId,
      type: lineType,
      vertices: [startVertexId, endVertexId],
      holes: [], // Will be populated when processing doors/windows
      properties: Map({
        height: Map({ length: 250 }), // Standard 8' ceiling (250cm)
        thickness: Map({ length: thickness }),
        textureA: 'bricks', // Default exterior texture
        textureB: 'bricks', // Default interior texture
      }),
    };

    lines = lines.set(lineId, lineData);

    // Maintain bidirectional vertex-line relationships (graph edges)
    vertices = vertices.updateIn([startVertexId, 'lines'], (linesList: any) =>
      [...(linesList || []), lineId]
    );
    vertices = vertices.updateIn([endVertexId, 'lines'], (linesList: any) =>
      [...(linesList || []), lineId]
    );
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 2: Convert Doors/Windows to Holes
  // ═══════════════════════════════════════════════════════════════════════
  walls.forEach((wall: Wall, index: number) => {
    if (wall.type !== 'door' && wall.type !== 'window') {
      return;
    }

    // Calculate the center point of the opening (approximation of position)
    const openingCenter = {
      x: (wall.start.x + wall.end.x) / 2,
      y: (wall.start.y + wall.end.y) / 2,
    };

    // Find which wall line this opening should attach to (spatial search)
    let closestLineId: string | null = null;
    let minDistance = Infinity;

    lines.forEach((line, lineId) => {
      const startVertex = vertices.get(line.vertices[0]);
      const endVertex = vertices.get(line.vertices[1]);

      if (!startVertex || !endVertex) return;

      // Calculate perpendicular distance from opening to line segment
      const dx = endVertex.x - startVertex.x;
      const dy = endVertex.y - startVertex.y;
      const lineLength = Math.sqrt(dx * dx + dy * dy);

      if (lineLength === 0) return;

      // Project opening position onto line (parametric t ∈ [0,1])
      const t = Math.max(
        0,
        Math.min(
          1,
          ((openingCenter.x - startVertex.x) * dx + (openingCenter.y - startVertex.y) * dy) /
            (lineLength * lineLength)
        )
      );

      // Find closest point on line segment
      const closestX = startVertex.x + t * dx;
      const closestY = startVertex.y + t * dy;

      // Euclidean distance from opening to line
      const distance = Math.sqrt(
        Math.pow(openingCenter.x - closestX, 2) + Math.pow(openingCenter.y - closestY, 2)
      );

      // Track the line with minimum distance
      if (distance < minDistance) {
        minDistance = distance;
        closestLineId = lineId;
      }
    });

    if (!closestLineId) return; // No suitable wall found

    // Create hole object with proper dimensions and placement
    const holeId = wall.id || generateId('hole', index);
    const line = lines.get(closestLineId);
    if (!line) return;

    const startVertex = vertices.get(line.vertices[0]);
    const endVertex = vertices.get(line.vertices[1]);
    if (!startVertex || !endVertex) return;

    // Calculate normalized position along wall (0 = start, 1 = end)
    const offset = calculateOffset(startVertex, endVertex, openingCenter);

    // Map door type or use 'window' for non-doors
    const holeType = wall.type === 'door' ? mapDoorType(wall.doorType) : 'window';

    const holeData: HoleData = {
      id: holeId,
      type: holeType,
      line: closestLineId,
      offset: offset,
      properties: Map({
        width: Map({ length: wall.type === 'door' ? 90 : 120 }), // 3' door / 4' window
        height: Map({ length: wall.type === 'door' ? 215 : 120 }), // 7' door / 4' window
        altitude: Map({ length: wall.type === 'door' ? 0 : 90 }), // Floor-level / sill height
      }),
    };

    holes = holes.set(holeId, holeData);

    // Maintain bidirectional line-hole relationship
    lines = lines.updateIn([closestLineId, 'holes'], (holesList: any) =>
      [...(holesList || []), holeId]
    );
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 3: Room Processing (Currently Skipped)
  // ═══════════════════════════════════════════════════════════════════════
  // Note: react-planner areas require closed polygons with ordered vertices.
  // The AI provides rooms as labeled points, not vertex-defined polygons.
  // Future enhancement: Compute room boundaries from wall intersections.
  rooms.forEach((room: Room, index: number) => {
    // TODO: Implement area creation with polygon vertex computation
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PHASE 4: Construct Immutable.js State Hierarchy
  // ═══════════════════════════════════════════════════════════════════════

  // Layer: Organizational container for related floor plan elements
  const layer = Map({
    id: 'layer-1',
    altitude: 0, // Z-axis offset (for multi-story buildings)
    order: 0, // Rendering stack order
    opacity: 1, // Transparency (0-1)
    name: 'Floor Plan',
    visible: true,
    // Convert plain objects to Immutable Maps with full react-planner schema
    vertices: vertices.map((v) =>
      Map({
        id: v.id,
        x: v.x,
        y: v.y,
        lines: List(v.lines), // References to connected lines
        areas: List(), // References to enclosed areas
        selected: false,
        type: '',
        prototype: 'vertices',
        name: '',
        misc: Map(),
        properties: Map(),
        visible: true,
      })
    ),
    lines: lines.map((l) =>
      Map({
        id: l.id,
        type: l.type,
        vertices: List(l.vertices), // References to endpoint vertices
        holes: List(l.holes), // References to doors/windows on this wall
        selected: false,
        prototype: 'lines',
        name: '',
        misc: Map(),
        properties: l.properties,
        visible: true,
      })
    ),
    holes: holes.map((h) =>
      Map({
        id: h.id,
        type: h.type,
        line: h.line, // Reference to parent wall
        offset: h.offset, // Position along wall (0-1)
        selected: false,
        prototype: 'holes',
        name: '',
        misc: Map(),
        properties: h.properties,
        visible: true,
      })
    ),
    areas: areas, // Empty for now (rooms not implemented)
    items: Map(), // Empty (furniture/fixtures added later)
    selected: Map({
      vertices: List(),
      lines: List(),
      holes: List(),
      areas: List(),
      items: List(),
    }),
  });

  // Scene: Top-level container with viewport and grid settings
  const scene = Map({
    unit: 'cm', // Measurement system (centimeters)
    layers: Map({ 'layer-1': layer }),
    selectedLayer: 'layer-1',
    groups: Map(), // Empty (element grouping not used)
    width: width || 3000, // Canvas width in pixels
    height: height || 2000, // Canvas height in pixels
    meta: Map(), // Custom metadata storage
    guides: Map({
      horizontal: Map(),
      vertical: Map(),
      circular: Map(),
    }),
    // Grid configuration for visual reference
    grids: Map({
      h1: Map({
        id: 'h1',
        type: 'horizontal-streak',
        properties: Map({
          step: 20, // Grid spacing in pixels
          colors: ['#808080', '#ddd', '#ddd', '#ddd', '#ddd'], // Alternating line colors
        }),
      }),
      v1: Map({
        id: 'v1',
        type: 'vertical-streak',
        properties: Map({
          step: 20,
          colors: ['#808080', '#ddd', '#ddd', '#ddd', '#ddd'],
        }),
      }),
    }),
  });

  // Complete react-planner state with all subsystems initialized
  const state = Map({
    mode: 'MODE_IDLE', // Current interaction mode (idle/drawing/selecting/etc.)
    scene: scene, // Main floor plan data
    sceneHistory: Map({
      // Undo/redo stack
      list: List(), // History snapshots
      first: scene, // Initial state
      last: scene, // Current state
    }),
    catalog: Map({
      // Element catalog (initialized by PlannerWrapper)
      ready: false,
      page: 'root',
      path: List(),
      elements: Map(),
    }),
    viewer2D: Map(), // 2D viewport state (pan, zoom)
    mouse: Map({ x: 0, y: 0 }), // Current mouse position
    zoom: 0, // Zoom level
    snapElements: List(), // Snap guides for alignment
    activeSnapElement: null, // Currently active snap
    drawingSupport: Map(), // Temporary state while drawing
    draggingSupport: Map(), // Temporary state while dragging
    rotatingSupport: Map(), // Temporary state while rotating
    errors: List(), // Validation errors
    warnings: List(), // Validation warnings
    clipboardProperties: Map(), // Copy/paste buffer
    selectedElementsHistory: List(), // Selection history
    misc: Map(), // Additional metadata
    alterate: false, // Alt key modifier state
  });

  // Convert from Immutable.js to plain JavaScript object
  return state.toJS();
}

/**
 * Extracts FloorPlanData from react-planner state after user edits.
 *
 * This reverse transformation allows the AI to understand manual changes made
 * by the user in the professional editor. The process involves:
 *
 * 1. Extract vertices, lines, and holes from the active layer
 * 2. Convert lines back to simple wall segments with start/end points
 * 3. Convert holes back to door/window wall objects
 * 4. Infer external walls from thickness property
 * 5. Return simplified FloorPlanData structure for AI processing
 *
 * Note: This is a lossy conversion - some react-planner features like materials,
 * precise measurements, and custom properties are discarded to match the
 * AI's simpler data model.
 *
 * @param plannerState - react-planner state (from Redux store or state changes)
 * @returns Simplified FloorPlanData for AI analysis and storage
 */
export function adaptPlannerToGemini(plannerState: any): FloorPlanData {
  // Extract scene and active layer from Immutable.js state
  const scene = fromJS(plannerState.scene);
  const layer = scene.getIn(['layers', scene.get('selectedLayer')]);

  // Return empty floor plan if no layer exists
  if (!layer) {
    return { walls: [], rooms: [], width: 3000, height: 2000 };
  }

  const walls: Wall[] = [];
  const rooms: Room[] = [];

  const vertices = layer.get('vertices');
  const lines = layer.get('lines');
  const holes = layer.get('holes');

  // ═══════════════════════════════════════════════════════════════════════
  // Convert Lines (CAD walls) → Simple Wall Objects
  // ═══════════════════════════════════════════════════════════════════════
  lines.forEach((line: any) => {
    const vertexIds = line.get('vertices');
    const v1 = vertices.get(vertexIds.get(0));
    const v2 = vertices.get(vertexIds.get(1));

    if (!v1 || !v2) return; // Skip invalid lines

    // Infer external wall classification from thickness (>15cm = exterior)
    const thickness = line.getIn(['properties', 'thickness', 'length']) || 10;
    const isExternal = thickness > 15;

    walls.push({
      id: line.get('id'),
      start: { x: v1.get('x'), y: v1.get('y') },
      end: { x: v2.get('x'), y: v2.get('y') },
      type: 'wall',
      isExternal,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // Convert Holes (CAD openings) → Door/Window Wall Objects
  // ═══════════════════════════════════════════════════════════════════════
  holes.forEach((hole: any) => {
    const lineId = hole.get('line');
    const line = lines.get(lineId);
    if (!line) return; // Skip orphaned holes

    // Get parent wall vertices
    const vertexIds = line.get('vertices');
    const v1 = vertices.get(vertexIds.get(0));
    const v2 = vertices.get(vertexIds.get(1));
    if (!v1 || !v2) return;

    // Calculate absolute position from normalized offset (0-1)
    const offset = hole.get('offset') || 0.5;
    const x = v1.get('x') + offset * (v2.get('x') - v1.get('x'));
    const y = v1.get('y') + offset * (v2.get('y') - v1.get('y'));

    // Determine if this is a door or window (heuristic: catalog ID contains 'door')
    const holeType = hole.get('type');
    const isDoor = holeType.includes('door');

    // Represent opening as a small wall segment centered on the hole position
    // Note: This is a simplified representation - actual dimensions are lost
    walls.push({
      id: hole.get('id'),
      start: { x: x - 5, y: y - 5 }, // Approximate bounding box
      end: { x: x + 5, y: y + 5 },
      type: isDoor ? 'door' : 'window',
      doorType: isDoor ? 'entry' : undefined,
      isExternal: false, // Openings are not classified as external
    });
  });

  // Return simplified FloorPlanData structure
  return {
    walls,
    rooms, // Empty - room extraction not implemented
    width: scene.get('width') || 3000,
    height: scene.get('height') || 2000,
  };
}
