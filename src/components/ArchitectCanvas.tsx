'use client';

import React, { useRef, useState } from 'react';
import { FloorPlanData, Wall, Point, RemodelZone, ScaleData, RulerData, Rect, OrientationData, AppStep, CanvasMode } from '@/types';

interface ArchitectCanvasProps {
  imageSrc: string | null;
  imageDims: { width: number; height: number } | null;
  data: FloorPlanData | null;
  mode: CanvasMode;
  scaleData: ScaleData;

  // State from parent
  remodelZone: RemodelZone | null;
  calibrationRuler: RulerData;
  garageRuler?: RulerData;
  stairRect?: Rect;
  orientation?: OrientationData;
  selectedId?: string | null;

  // Callbacks
  onDataUpdate?: (newData: FloorPlanData) => void;
  onZoneUpdate: (zone: RemodelZone | null) => void;
  onRulerUpdate: (ruler: RulerData, type?: 'calibration' | 'garage') => void;
  onStairUpdate?: (rect: Rect) => void;
  onOrientationUpdate?: (data: OrientationData) => void;
  onSelect?: (type: 'wall' | 'room' | 'door' | null, id: string | null) => void;
  onWallClick?: (wall: Wall) => void;
  onCanvasClick?: (pt: Point) => void;
  onWallDraw?: (start: Point, end: Point) => void;
}

const ArchitectCanvas: React.FC<ArchitectCanvasProps> = ({
  imageSrc,
  imageDims,
  data,
  mode,
  scaleData,
  onDataUpdate,
  onZoneUpdate,
  onRulerUpdate,
  onStairUpdate,
  onOrientationUpdate,
  onSelect,
  onWallClick,
  onCanvasClick,
  onWallDraw,
  remodelZone,
  calibrationRuler,
  garageRuler,
  stairRect,
  orientation,
  selectedId,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  // Interaction State
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragMode, setDragMode] = useState<'PAN' | 'RULER_CALIB' | 'RULER_GARAGE' | 'ZONE' | 'STAIR' | 'DOOR' | 'DRAWING' | 'COMPASS' | null>(null);
  const [activeHandle, setActiveHandle] = useState<string | null>(null);

  // For Wall Drawing Preview
  const [drawCurrent, setDrawCurrent] = useState<Point | null>(null);

  // Local state for door dragging - only commit to parent on pointerUp
  const [localDoorOffset, setLocalDoorOffset] = useState<{ dx: number; dy: number } | null>(null);

  // Calculate dynamic styling based on plan size
  const planWidth = imageDims?.width || 1000;
  const planHeight = imageDims?.height || 1000;
  const uiScale = Math.max(planWidth, planHeight) / 1000;

  // Dynamic visual properties
  const wallStroke = 5 * uiScale;
  const wallStrokeExt = 8 * uiScale;
  const handleRadius = 15 * uiScale;
  const rulerStroke = 4 * uiScale;
  const fontSize = 24 * uiScale;

  // Coordinate conversion using DOMPoint
  const getMousePos = (e: React.MouseEvent | React.PointerEvent): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };

    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };

    const pt = new DOMPoint(e.clientX, e.clientY);
    const svgP = pt.matrixTransform(ctm.inverse());
    return { x: svgP.x, y: svgP.y };
  };

  // Distance to line segment helper
  const distToSegment = (p: Point, v: Point, w: Point) => {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  };

  // --- Mode-specific pointer down handlers ---
  const handleOrientationPointerDown = (pos: Point): boolean => {
    if (mode !== AppStep.ORIENTATION || !orientation || !onOrientationUpdate) return false;
    const cx = planWidth * 0.9;
    const cy = planHeight * 0.1;
    const radius = 60 * uiScale;
    const angleRad = (orientation.frontAngle || 0) * (Math.PI / 180);
    const hx = cx + radius * Math.cos(angleRad);
    const hy = cy + radius * Math.sin(angleRad);

    if (Math.hypot(pos.x - hx, pos.y - hy) < handleRadius * 2) {
      setDragMode('COMPASS');
      return true;
    }
    return false;
  };

  const handleRulerPointerDown = (pos: Point): boolean => {
    if (mode === AppStep.CALIBRATION || mode === AppStep.SCALE_VERIFICATION_ROOMS || mode === 'CALIBRATE') {
      const distStart = Math.hypot(pos.x - calibrationRuler.start.x, pos.y - calibrationRuler.start.y);
      const distEnd = Math.hypot(pos.x - calibrationRuler.end.x, pos.y - calibrationRuler.end.y);
      if (distStart < handleRadius * 2) {
        setDragMode('RULER_CALIB');
        setActiveHandle('start');
        return true;
      }
      if (distEnd < handleRadius * 2) {
        setDragMode('RULER_CALIB');
        setActiveHandle('end');
        return true;
      }
    }
    if (mode === AppStep.ORIENTATION && garageRuler) {
      const distStart = Math.hypot(pos.x - garageRuler.start.x, pos.y - garageRuler.start.y);
      const distEnd = Math.hypot(pos.x - garageRuler.end.x, pos.y - garageRuler.end.y);
      if (distStart < handleRadius * 2) {
        setDragMode('RULER_GARAGE');
        setActiveHandle('start');
        return true;
      }
      if (distEnd < handleRadius * 2) {
        setDragMode('RULER_GARAGE');
        setActiveHandle('end');
        return true;
      }
    }
    return false;
  };

  const handleStairPointerDown = (pos: Point): boolean => {
    if (mode !== AppStep.STAIR_MARKING || !stairRect || !onStairUpdate) return false;
    const handles = [
      { id: 'tl', x: stairRect.x, y: stairRect.y },
      { id: 'tr', x: stairRect.x + stairRect.width, y: stairRect.y },
      { id: 'bl', x: stairRect.x, y: stairRect.y + stairRect.height },
      { id: 'br', x: stairRect.x + stairRect.width, y: stairRect.y + stairRect.height },
      { id: 'center', x: stairRect.x + stairRect.width / 2, y: stairRect.y + stairRect.height / 2 },
    ];
    for (const h of handles) {
      if (Math.hypot(pos.x - h.x, pos.y - h.y) < handleRadius * 2) {
        setDragMode('STAIR');
        setActiveHandle(h.id);
        return true;
      }
    }
    return false;
  };

  const handleDoorPointerDown = (pos: Point): boolean => {
    if (mode !== AppStep.CORRECTION_DOORS || !data) return false;
    const clickedDoor = data.walls.find(
      (w) => w.type === 'door' && Math.hypot(pos.x - (w.start.x + w.end.x) / 2, pos.y - (w.start.y + w.end.y) / 2) < handleRadius * 1.5
    );
    if (clickedDoor) {
      setDragMode('DOOR');
      setActiveHandle(clickedDoor.id);
      setLocalDoorOffset({ dx: 0, dy: 0 });
      if (onSelect) onSelect('door', clickedDoor.id);
      return true;
    }
    return false;
  };

  const handleWallDrawingPointerDown = (pos: Point): boolean => {
    if (mode !== AppStep.CORRECTION_WALLS) return false;
    const clickedWall = data?.walls.find((w) => distToSegment(pos, w.start, w.end) < wallStrokeExt);
    if (clickedWall) {
      if (onSelect) onSelect('wall', clickedWall.id);
      if (onWallClick) onWallClick(clickedWall);
      return true;
    }
    setDragMode('DRAWING');
    setDrawCurrent(pos);
    return true;
  };

  const handleZonePointerDown = (pos: Point): boolean => {
    if (mode !== AppStep.REMODEL && mode !== 'ZONE') return false;
    onZoneUpdate({ x: pos.x, y: pos.y, width: 0, height: 0 });
    setDragMode('ZONE');
    return true;
  };

  const handleGeneralClick = (pos: Point): void => {
    if (mode === AppStep.STRUCTURAL_ID || mode === AppStep.ORIENTATION || mode === AppStep.CORRECTION_DOORS) {
      const clickedWall = data?.walls.find((w) => distToSegment(pos, w.start, w.end) < wallStrokeExt * 1.5);
      if (clickedWall) {
        if (onWallClick) onWallClick(clickedWall);
        if (onSelect) onSelect('wall', clickedWall.id);
      } else {
        if (onCanvasClick) onCanvasClick(pos);
        if (onSelect) onSelect(null, null);
      }
    }
    if (mode === AppStep.LABEL_REVIEW) {
      if (onCanvasClick) onCanvasClick(pos);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const pos = getMousePos(e);
    setDragStart(pos);
    (e.target as Element).setPointerCapture(e.pointerId);

    // Try each mode-specific handler in order
    if (handleOrientationPointerDown(pos)) return;
    if (handleRulerPointerDown(pos)) return;
    if (handleStairPointerDown(pos)) return;
    if (handleDoorPointerDown(pos)) return;
    if (handleWallDrawingPointerDown(pos)) return;
    if (handleZonePointerDown(pos)) return;
    
    // Fallback to general click handling
    handleGeneralClick(pos);
  };

  // --- Mode-specific pointer move handlers ---
  const handleCompassMove = (pos: Point): void => {
    if (!onOrientationUpdate || !orientation) return;
    const cx = planWidth * 0.9;
    const cy = planHeight * 0.1;
    const dx = pos.x - cx;
    const dy = pos.y - cy;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    onOrientationUpdate({ ...orientation, frontAngle: angle });
  };

  const handleRulerMove = (pos: Point): void => {
    if (dragMode === 'RULER_CALIB' && activeHandle) {
      const newRuler = { ...calibrationRuler };
      if (activeHandle === 'start') newRuler.start = pos;
      if (activeHandle === 'end') newRuler.end = pos;
      onRulerUpdate(newRuler, 'calibration');
    }
    if (dragMode === 'RULER_GARAGE' && activeHandle && garageRuler) {
      const newRuler = { ...garageRuler };
      if (activeHandle === 'start') newRuler.start = pos;
      if (activeHandle === 'end') newRuler.end = pos;
      onRulerUpdate(newRuler, 'garage');
    }
  };

  const handleStairMove = (pos: Point): void => {
    if (!activeHandle || !onStairUpdate || !stairRect || !dragStart) return;
    const newRect = { ...stairRect };
    if (activeHandle === 'center') {
      const dx = pos.x - dragStart.x;
      const dy = pos.y - dragStart.y;
      newRect.x += dx;
      newRect.y += dy;
      setDragStart(pos);
    } else {
      if (activeHandle.includes('l')) {
        const diff = pos.x - newRect.x;
        newRect.x += diff;
        newRect.width -= diff;
      }
      if (activeHandle.includes('r')) {
        newRect.width = pos.x - newRect.x;
      }
      if (activeHandle.includes('t')) {
        const diff = pos.y - newRect.y;
        newRect.y += diff;
        newRect.height -= diff;
      }
      if (activeHandle.includes('b')) {
        newRect.height = pos.y - newRect.y;
      }
      if (newRect.width < 10) newRect.width = 10;
      if (newRect.height < 10) newRect.height = 10;
    }
    onStairUpdate(newRect);
  };

  const handleDoorMove = (pos: Point): void => {
    if (!activeHandle || !dragStart) return;
    // Update local offset only - don't call parent on every move
    const dx = pos.x - dragStart.x;
    const dy = pos.y - dragStart.y;
    setLocalDoorOffset({ dx, dy });
  };

  const handleDrawingMove = (pos: Point): void => {
    if (!dragStart) return;
    const dx = Math.abs(pos.x - dragStart.x);
    const dy = Math.abs(pos.y - dragStart.y);
    const endP = { ...pos };
    if (dx > dy) endP.y = dragStart.y;
    else endP.x = dragStart.x;
    setDrawCurrent(endP);
  };

  const handleZoneMove = (pos: Point): void => {
    if (!dragStart) return;
    const width = pos.x - dragStart.x;
    const height = pos.y - dragStart.y;
    onZoneUpdate({
      x: width < 0 ? pos.x : dragStart.x,
      y: height < 0 ? pos.y : dragStart.y,
      width: Math.abs(width),
      height: Math.abs(height),
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pos = getMousePos(e);

    if (!dragMode || !dragStart) return;

    switch (dragMode) {
      case 'COMPASS':
        handleCompassMove(pos);
        break;
      case 'RULER_CALIB':
      case 'RULER_GARAGE':
        handleRulerMove(pos);
        break;
      case 'STAIR':
        handleStairMove(pos);
        break;
      case 'DOOR':
        handleDoorMove(pos);
        break;
      case 'DRAWING':
        handleDrawingMove(pos);
        break;
      case 'ZONE':
        handleZoneMove(pos);
        break;
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // Commit door position change to parent only on pointer up
    if (dragMode === 'DOOR' && activeHandle && data && onDataUpdate && localDoorOffset) {
      const { dx, dy } = localDoorOffset;
      if (dx !== 0 || dy !== 0) {
        const newWalls = data.walls.map((w) => {
          if (w.id === activeHandle) {
            return {
              ...w,
              start: { x: w.start.x + dx, y: w.start.y + dy },
              end: { x: w.end.x + dx, y: w.end.y + dy },
            };
          }
          return w;
        });
        onDataUpdate({ ...data, walls: newWalls });
      }
    }
    
    if (dragMode === 'DRAWING' && dragStart && drawCurrent && onWallDraw) {
      onWallDraw(dragStart, drawCurrent);
    }
    
    setDragStart(null);
    setDragMode(null);
    setActiveHandle(null);
    setDrawCurrent(null);
    setLocalDoorOffset(null);
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  if (!imageSrc) {
    return <div className="h-full w-full bg-gray-100 flex items-center justify-center text-gray-400">Select a Floor to View</div>;
  }

  // Determine wall color based on mode
  const getWallColor = (wall: Wall) => {
    const isSelected = selectedId === wall.id;

    if (mode === AppStep.STRUCTURAL_ID) {
      if (wall.isLoadBearing || wall.isExternal) return '#dc2626';
      return '#cbd5e1';
    }

    if (mode === AppStep.ORIENTATION && orientation?.frontDoorId === wall.id) {
      return '#16a34a'; // Green for front door
    }

    if (isSelected) return '#3b82f6';
    return wall.isExternal ? '#ef4444' : '#1e293b';
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-100 border rounded-lg shadow-inner cursor-crosshair">
      <svg
        id="main-plan-svg"
        ref={svgRef}
        viewBox={`0 0 ${planWidth} ${planHeight}`}
        className="w-full h-full touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setDrawCurrent(null)}
        preserveAspectRatio="xMidYMid meet"
        style={{ pointerEvents: 'all' }}
      >
        {/* Background Image */}
        {imageSrc && <image href={imageSrc} x="0" y="0" width={planWidth} height={planHeight} opacity={0.5} className="pointer-events-none" />}

        {/* Walls */}
        {data?.walls?.map((wall, idx) => {
          if (!wall?.start || !wall?.end) return null;
          const isSelected = selectedId === wall.id;
          const strokeColor = getWallColor(wall);
          
          // Apply local door offset for visual feedback during drag
          const isDragging = dragMode === 'DOOR' && activeHandle === wall.id && localDoorOffset;
          const offsetX = isDragging ? localDoorOffset.dx : 0;
          const offsetY = isDragging ? localDoorOffset.dy : 0;

          return (
            <g key={`wall-${idx}`}>
              <line
                x1={wall.start.x + offsetX}
                y1={wall.start.y + offsetY}
                x2={wall.end.x + offsetX}
                y2={wall.end.y + offsetY}
                stroke={strokeColor}
                strokeWidth={wall.isExternal ? wallStrokeExt : wallStroke}
                strokeLinecap="round"
                className="transition-colors duration-200"
              />
              {wall.type === 'window' && (
                <line x1={wall.start.x + offsetX} y1={wall.start.y + offsetY} x2={wall.end.x + offsetX} y2={wall.end.y + offsetY} stroke="#0ea5e9" strokeWidth={wallStroke * 0.6} />
              )}
              {wall.type === 'door' && (
                <g className={mode === AppStep.CORRECTION_DOORS ? 'cursor-move' : ''}>
                  <circle
                    cx={(wall.start.x + wall.end.x) / 2 + offsetX}
                    cy={(wall.start.y + wall.end.y) / 2 + offsetY}
                    r={handleRadius * 0.8}
                    fill={isSelected ? 'rgba(59, 130, 246, 0.2)' : 'white'}
                    stroke={isSelected ? '#3b82f6' : '#eab308'}
                    strokeWidth={wallStroke * 0.5}
                  />
                  {wall.doorType && (
                    <text
                      x={(wall.start.x + wall.end.x) / 2 + offsetX}
                      y={(wall.start.y + wall.end.y) / 2 + offsetY}
                      dy={-handleRadius}
                      textAnchor="middle"
                      fontSize={fontSize * 0.5}
                      fill="#eab308"
                      className="font-bold uppercase pointer-events-none"
                    >
                      {wall.doorType[0]}
                    </text>
                  )}
                </g>
              )}
            </g>
          );
        })}

        {/* Wall Drawing Preview */}
        {dragMode === 'DRAWING' && dragStart && drawCurrent && (
          <line x1={dragStart.x} y1={dragStart.y} x2={drawCurrent.x} y2={drawCurrent.y} stroke="#10b981" strokeWidth={wallStroke} strokeDasharray="5,5" />
        )}

        {/* Room Labels */}
        {data?.rooms?.map((room, idx) => {
          if (!room?.labelPosition) return null;
          return (
            <text
              key={`room-${idx}`}
              x={room.labelPosition.x}
              y={room.labelPosition.y}
              textAnchor="middle"
              className="fill-slate-700 font-bold pointer-events-none select-none"
              style={{ fontSize: fontSize }}
            >
              {room.name}
            </text>
          );
        })}

        {/* Remodel Zone Overlay */}
        {remodelZone && (mode === AppStep.REMODEL || mode === 'ZONE') && (
          <rect
            x={remodelZone.x}
            y={remodelZone.y}
            width={remodelZone.width}
            height={remodelZone.height}
            fill="rgba(16, 185, 129, 0.2)"
            stroke="#10b981"
            strokeWidth={wallStroke * 0.6}
            strokeDasharray={`${handleRadius},${handleRadius / 2}`}
            pointerEvents="none"
          />
        )}

        {/* Stair Tool */}
        {mode === AppStep.STAIR_MARKING && stairRect && (
          <g>
            <rect
              x={stairRect.x}
              y={stairRect.y}
              width={stairRect.width}
              height={stairRect.height}
              fill="rgba(249, 115, 22, 0.2)"
              stroke="#f97316"
              strokeWidth={rulerStroke}
              className="cursor-move"
            />
            {['tl', 'tr', 'bl', 'br'].map((pos) => {
              const hx = pos.includes('l') ? stairRect.x : stairRect.x + stairRect.width;
              const hy = pos.includes('t') ? stairRect.y : stairRect.y + stairRect.height;
              return <circle key={pos} cx={hx} cy={hy} r={handleRadius / 1.5} fill="white" stroke="#f97316" strokeWidth={2} className="cursor-nwse-resize" />;
            })}
          </g>
        )}

        {/* Calibration Ruler (Red) */}
        {(mode === AppStep.CALIBRATION || mode === AppStep.SCALE_VERIFICATION_ROOMS || mode === 'CALIBRATE') && (
          <g>
            <line
              x1={calibrationRuler.start.x}
              y1={calibrationRuler.start.y}
              x2={calibrationRuler.end.x}
              y2={calibrationRuler.end.y}
              stroke="#f43f5e"
              strokeWidth={rulerStroke}
              strokeDasharray={`${rulerStroke * 2},${rulerStroke}`}
            />
            <circle cx={calibrationRuler.start.x} cy={calibrationRuler.start.y} r={handleRadius} fill="#f43f5e" className="cursor-move" stroke="white" strokeWidth={2} />
            <text
              x={calibrationRuler.start.x}
              y={calibrationRuler.start.y - handleRadius * 1.5}
              textAnchor="middle"
              fill="#f43f5e"
              style={{ fontSize }}
              className="font-bold pointer-events-none"
            >
              A
            </text>
            <circle cx={calibrationRuler.end.x} cy={calibrationRuler.end.y} r={handleRadius} fill="#f43f5e" className="cursor-move" stroke="white" strokeWidth={2} />
            <text
              x={calibrationRuler.end.x}
              y={calibrationRuler.end.y - handleRadius * 1.5}
              textAnchor="middle"
              fill="#f43f5e"
              style={{ fontSize }}
              className="font-bold pointer-events-none"
            >
              B
            </text>
          </g>
        )}

        {/* Garage Ruler (Purple) */}
        {mode === AppStep.ORIENTATION && garageRuler && (
          <g>
            <line
              x1={garageRuler.start.x}
              y1={garageRuler.start.y}
              x2={garageRuler.end.x}
              y2={garageRuler.end.y}
              stroke="#9333ea"
              strokeWidth={rulerStroke}
              strokeDasharray={`${rulerStroke * 2},${rulerStroke}`}
            />
            <circle cx={garageRuler.start.x} cy={garageRuler.start.y} r={handleRadius} fill="#9333ea" className="cursor-move" stroke="white" strokeWidth={2} />
            <text
              x={garageRuler.start.x}
              y={garageRuler.start.y - handleRadius * 1.5}
              textAnchor="middle"
              fill="#9333ea"
              style={{ fontSize }}
              className="font-bold pointer-events-none"
            >
              G1
            </text>
            <circle cx={garageRuler.end.x} cy={garageRuler.end.y} r={handleRadius} fill="#9333ea" className="cursor-move" stroke="white" strokeWidth={2} />
            <text
              x={garageRuler.end.x}
              y={garageRuler.end.y - handleRadius * 1.5}
              textAnchor="middle"
              fill="#9333ea"
              style={{ fontSize }}
              className="font-bold pointer-events-none"
            >
              G2
            </text>
          </g>
        )}

        {/* Orientation Compass */}
        {mode === AppStep.ORIENTATION && orientation && (
          <g transform={`translate(${planWidth * 0.9}, ${planHeight * 0.1})`}>
            <circle r={60 * uiScale} fill="rgba(255,255,255,0.8)" stroke="#cbd5e1" strokeWidth={2} />
            <g transform={`rotate(${orientation.frontAngle || 0})`}>
              <path d={`M 0 ${-50 * uiScale} L ${-15 * uiScale} ${-10 * uiScale} L ${15 * uiScale} ${-10 * uiScale} Z`} fill="#ef4444" />
              <path d={`M 0 ${50 * uiScale} L ${-15 * uiScale} ${10 * uiScale} L ${15 * uiScale} ${10 * uiScale} Z`} fill="#cbd5e1" />
              <circle cx="0" cy={-60 * uiScale} r={handleRadius} fill="#ef4444" stroke="white" strokeWidth={2} className="cursor-grab" />
            </g>
            <text y={85 * uiScale} textAnchor="middle" className="font-bold text-xs pointer-events-none" style={{ fontSize: fontSize * 0.8 }} fill="#64748b">
              FRONT
            </text>
          </g>
        )}
      </svg>

      {/* Legend / Overlay Info */}
      <div className="absolute top-4 left-4 bg-white/90 p-2 rounded shadow text-xs space-y-1 backdrop-blur-sm pointer-events-none z-10">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div> Structural Anchor (External)
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-slate-800 rounded-full"></div> Internal Wall
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500/50 border border-green-500 rounded"></div> Remodel Zone
        </div>
        {scaleData.calibrated && <div className="mt-2 text-slate-500 font-mono">Scale: 1ft = {scaleData.pixelsPerFoot.toFixed(2)}px</div>}
      </div>
    </div>
  );
};

export default ArchitectCanvas;
