/**
 * Planner Adapter
 *
 * Translates between Gemini FloorPlanData format and react-planner state format.
 *
 * FloorPlanData (Gemini AI format):
 * - Simple coordinate-based walls, rooms, doors, windows
 * - Coordinates in absolute x/y positions
 *
 * ReactPlannerState (react-planner format):
 * - Immutable.js based structure
 * - Scene -> Layer -> Vertices/Lines/Holes/Areas/Items
 * - Vertices are shared between lines
 * - Holes (doors/windows) are positioned on lines
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
 * Generates a unique ID with a prefix
 */
function generateId(prefix: string, index: number): string {
  return `${prefix}-${index}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Finds or creates a vertex at the given position
 * Vertices are shared when walls connect at the same point
 */
function findOrCreateVertex(
  vertices: Map<string, VertexData>,
  point: Point,
  tolerance: number = 1
): { vertices: Map<string, VertexData>; vertexId: string } {
  // Check if a vertex already exists at this position
  const existingVertex = vertices.find((v) => {
    const dx = v.x - point.x;
    const dy = v.y - point.y;
    return Math.sqrt(dx * dx + dy * dy) < tolerance;
  });

  if (existingVertex) {
    return { vertices, vertexId: existingVertex.id };
  }

  // Create new vertex
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
 * Calculates the offset of a point along a line segment
 * Returns value between 0 and 1
 */
function calculateOffset(lineStart: Point, lineEnd: Point, point: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lineLength = Math.sqrt(dx * dx + dy * dy);

  if (lineLength === 0) return 0.5;

  const pointDx = point.x - lineStart.x;
  const pointDy = point.y - lineStart.y;
  const dotProduct = pointDx * dx + pointDy * dy;

  return Math.max(0, Math.min(1, dotProduct / (lineLength * lineLength)));
}

/**
 * Maps door types from Gemini format to react-planner catalog IDs
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
 * Converts FloorPlanData to react-planner state
 */
export function adaptGeminiToPlanner(floorData: FloorPlanData): any {
  let vertices = Map<string, VertexData>();
  let lines = Map<string, LineData>();
  let holes = Map<string, HoleData>();
  let areas = Map<string, AreaData>();

  const { walls, rooms, width, height } = floorData;

  // Process walls and create vertices/lines
  walls.forEach((wall: Wall, index: number) => {
    // Skip walls that are actually openings (they'll be processed as holes)
    if (wall.type === 'door' || wall.type === 'window') {
      return;
    }

    // Create or find vertices for wall endpoints
    let result1 = findOrCreateVertex(vertices, wall.start);
    vertices = result1.vertices;
    const startVertexId = result1.vertexId;

    let result2 = findOrCreateVertex(vertices, wall.end);
    vertices = result2.vertices;
    const endVertexId = result2.vertexId;

    // Create line
    const lineId = wall.id || generateId('line', index);
    const lineType = wall.type === 'wall' ? 'wall' : 'wall';

    // Determine wall thickness based on external/internal
    const thickness = wall.isExternal ? 20 : 10;

    const lineData: LineData = {
      id: lineId,
      type: lineType,
      vertices: [startVertexId, endVertexId],
      holes: [],
      properties: Map({
        height: Map({ length: 250 }),
        thickness: Map({ length: thickness }),
        textureA: 'bricks',
        textureB: 'bricks',
      }),
    };

    lines = lines.set(lineId, lineData);

    // Update vertices to reference this line
    vertices = vertices.updateIn([startVertexId, 'lines'], (linesList: any) =>
      [...(linesList || []), lineId]
    );
    vertices = vertices.updateIn([endVertexId, 'lines'], (linesList: any) =>
      [...(linesList || []), lineId]
    );
  });

  // Process doors and windows as holes
  walls.forEach((wall: Wall, index: number) => {
    if (wall.type !== 'door' && wall.type !== 'window') {
      return;
    }

    // Find the line this opening belongs to
    // We need to find which wall line contains this door/window point
    const openingCenter = {
      x: (wall.start.x + wall.end.x) / 2,
      y: (wall.start.y + wall.end.y) / 2,
    };

    // Find closest line
    let closestLineId: string | null = null;
    let minDistance = Infinity;

    lines.forEach((line, lineId) => {
      const startVertex = vertices.get(line.vertices[0]);
      const endVertex = vertices.get(line.vertices[1]);

      if (!startVertex || !endVertex) return;

      // Calculate distance from opening center to line
      const dx = endVertex.x - startVertex.x;
      const dy = endVertex.y - startVertex.y;
      const lineLength = Math.sqrt(dx * dx + dy * dy);

      if (lineLength === 0) return;

      const t = Math.max(
        0,
        Math.min(
          1,
          ((openingCenter.x - startVertex.x) * dx + (openingCenter.y - startVertex.y) * dy) /
            (lineLength * lineLength)
        )
      );

      const closestX = startVertex.x + t * dx;
      const closestY = startVertex.y + t * dy;
      const distance = Math.sqrt(
        Math.pow(openingCenter.x - closestX, 2) + Math.pow(openingCenter.y - closestY, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestLineId = lineId;
      }
    });

    if (!closestLineId) return;

    // Create hole on the line
    const holeId = wall.id || generateId('hole', index);
    const line = lines.get(closestLineId);
    if (!line) return;

    const startVertex = vertices.get(line.vertices[0]);
    const endVertex = vertices.get(line.vertices[1]);
    if (!startVertex || !endVertex) return;

    const offset = calculateOffset(startVertex, endVertex, openingCenter);

    const holeType = wall.type === 'door' ? mapDoorType(wall.doorType) : 'window';

    const holeData: HoleData = {
      id: holeId,
      type: holeType,
      line: closestLineId,
      offset: offset,
      properties: Map({
        width: Map({ length: wall.type === 'door' ? 90 : 120 }),
        height: Map({ length: wall.type === 'door' ? 215 : 120 }),
        altitude: Map({ length: wall.type === 'door' ? 0 : 90 }),
      }),
    };

    holes = holes.set(holeId, holeData);

    // Update line to reference this hole
    lines = lines.updateIn([closestLineId, 'holes'], (holesList: any) =>
      [...(holesList || []), holeId]
    );
  });

  // Process rooms as areas
  rooms.forEach((room: Room, index: number) => {
    // For now, we'll skip area creation as it requires polygon vertex computation
    // Areas in react-planner are complex polygons defined by vertices
    // The AI-generated rooms are just labels, not closed polygons
    // We can add this in a future enhancement
  });

  // Build the layer structure
  const layer = Map({
    id: 'layer-1',
    altitude: 0,
    order: 0,
    opacity: 1,
    name: 'Floor Plan',
    visible: true,
    vertices: vertices.map((v) =>
      Map({
        id: v.id,
        x: v.x,
        y: v.y,
        lines: List(v.lines),
        areas: List(),
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
        vertices: List(l.vertices),
        holes: List(l.holes),
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
        line: h.line,
        offset: h.offset,
        selected: false,
        prototype: 'holes',
        name: '',
        misc: Map(),
        properties: h.properties,
        visible: true,
      })
    ),
    areas: areas,
    items: Map(),
    selected: Map({
      vertices: List(),
      lines: List(),
      holes: List(),
      areas: List(),
      items: List(),
    }),
  });

  // Build the scene structure
  const scene = Map({
    unit: 'cm',
    layers: Map({ 'layer-1': layer }),
    selectedLayer: 'layer-1',
    groups: Map(),
    width: width || 3000,
    height: height || 2000,
    meta: Map(),
    guides: Map({
      horizontal: Map(),
      vertical: Map(),
      circular: Map(),
    }),
    grids: Map({
      h1: Map({
        id: 'h1',
        type: 'horizontal-streak',
        properties: Map({
          step: 20,
          colors: ['#808080', '#ddd', '#ddd', '#ddd', '#ddd'],
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

  // Build the complete state
  const state = Map({
    mode: 'MODE_IDLE',
    scene: scene,
    sceneHistory: Map({
      list: List(),
      first: scene,
      last: scene,
    }),
    catalog: Map({
      ready: false,
      page: 'root',
      path: List(),
      elements: Map(),
    }),
    viewer2D: Map(),
    mouse: Map({ x: 0, y: 0 }),
    zoom: 0,
    snapElements: List(),
    activeSnapElement: null,
    drawingSupport: Map(),
    draggingSupport: Map(),
    rotatingSupport: Map(),
    errors: List(),
    warnings: List(),
    clipboardProperties: Map(),
    selectedElementsHistory: List(),
    misc: Map(),
    alterate: false,
  });

  return state.toJS();
}

/**
 * Converts react-planner state back to FloorPlanData
 * This allows extracting the modified floor plan after user edits
 */
export function adaptPlannerToGemini(plannerState: any): FloorPlanData {
  const scene = fromJS(plannerState.scene);
  const layer = scene.getIn(['layers', scene.get('selectedLayer')]);

  if (!layer) {
    return { walls: [], rooms: [], width: 3000, height: 2000 };
  }

  const walls: Wall[] = [];
  const rooms: Room[] = [];

  const vertices = layer.get('vertices');
  const lines = layer.get('lines');
  const holes = layer.get('holes');

  // Convert lines to walls
  lines.forEach((line: any) => {
    const vertexIds = line.get('vertices');
    const v1 = vertices.get(vertexIds.get(0));
    const v2 = vertices.get(vertexIds.get(1));

    if (!v1 || !v2) return;

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

  // Convert holes to door/window walls
  holes.forEach((hole: any) => {
    const lineId = hole.get('line');
    const line = lines.get(lineId);
    if (!line) return;

    const vertexIds = line.get('vertices');
    const v1 = vertices.get(vertexIds.get(0));
    const v2 = vertices.get(vertexIds.get(1));
    if (!v1 || !v2) return;

    const offset = hole.get('offset') || 0.5;
    const x = v1.get('x') + offset * (v2.get('x') - v1.get('x'));
    const y = v1.get('y') + offset * (v2.get('y') - v1.get('y'));

    const holeType = hole.get('type');
    const isDoor = holeType.includes('door');

    walls.push({
      id: hole.get('id'),
      start: { x: x - 5, y: y - 5 },
      end: { x: x + 5, y: y + 5 },
      type: isDoor ? 'door' : 'window',
      doorType: isDoor ? 'entry' : undefined,
      isExternal: false,
    });
  });

  return {
    walls,
    rooms,
    width: scene.get('width') || 3000,
    height: scene.get('height') || 2000,
  };
}
