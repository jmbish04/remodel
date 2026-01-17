'use client';

import React, { useRef, useState } from 'react';
import { FloorPlanData, Point, RemodelZone, ScaleData, RulerData, CanvasMode } from '@/types';

interface ArchitectCanvasProps {
  imageSrc: string | null;
  imageDims: { width: number; height: number } | null;
  data: FloorPlanData | null;
  mode: CanvasMode;
  scaleData: ScaleData;
  onZoneUpdate: (zone: RemodelZone | null) => void;
  onRulerUpdate: (ruler: RulerData) => void;
  remodelZone: RemodelZone | null;
  calibrationRuler: RulerData;
}

const ArchitectCanvas: React.FC<ArchitectCanvasProps> = ({
  imageSrc,
  imageDims,
  data,
  mode,
  scaleData,
  onZoneUpdate,
  onRulerUpdate,
  remodelZone,
  calibrationRuler,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [activeHandle, setActiveHandle] = useState<'start' | 'end' | null>(null);

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

  // Coordinate conversion using DOMMatrix
  const getMousePos = (e: React.MouseEvent | React.PointerEvent): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };

    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };

    // Use DOMPoint instead of deprecated createSVGPoint
    const pt = new DOMPoint(e.clientX, e.clientY);
    const svgP = pt.matrixTransform(ctm.inverse());
    return { x: svgP.x, y: svgP.y };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const pos = getMousePos(e);

    if (mode === 'CALIBRATE') {
      const distStart = Math.hypot(pos.x - calibrationRuler.start.x, pos.y - calibrationRuler.start.y);
      const distEnd = Math.hypot(pos.x - calibrationRuler.end.x, pos.y - calibrationRuler.end.y);

      if (distStart < handleRadius * 2) {
        setActiveHandle('start');
        (e.target as Element).setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      } else if (distEnd < handleRadius * 2) {
        setActiveHandle('end');
        (e.target as Element).setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }

    if (mode === 'ZONE') {
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);
      setDragStart(pos);
      onZoneUpdate({ x: pos.x, y: pos.y, width: 0, height: 0 });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const pos = getMousePos(e);
    e.preventDefault();

    if (mode === 'CALIBRATE' && activeHandle) {
      const newRuler = { ...calibrationRuler };
      if (activeHandle === 'start') newRuler.start = pos;
      if (activeHandle === 'end') newRuler.end = pos;
      onRulerUpdate(newRuler);
      return;
    }

    if (mode === 'ZONE' && dragStart) {
      const width = pos.x - dragStart.x;
      const height = pos.y - dragStart.y;

      const x = width < 0 ? pos.x : dragStart.x;
      const y = height < 0 ? pos.y : dragStart.y;

      onZoneUpdate({
        x,
        y,
        width: Math.abs(width),
        height: Math.abs(height),
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setDragStart(null);
    setActiveHandle(null);
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  if (!imageSrc) {
    return (
      <div className="h-full w-full bg-gray-100 flex items-center justify-center text-gray-400">
        Select a Floor to View
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-100 border rounded-lg shadow-inner cursor-crosshair">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${planWidth} ${planHeight}`}
        className="w-full h-full touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        preserveAspectRatio="xMidYMid meet"
        style={{ pointerEvents: 'all' }}
      >
        {/* Background Image */}
        {imageSrc && (
          <image
            href={imageSrc}
            x="0"
            y="0"
            width={planWidth}
            height={planHeight}
            opacity={0.4}
            className="pointer-events-none"
          />
        )}

        {/* Walls */}
        {data?.walls?.map((wall, idx) => {
          if (!wall?.start || !wall?.end) return null;
          return (
            <g key={`wall-${idx}`}>
              <line
                x1={wall.start.x}
                y1={wall.start.y}
                x2={wall.end.x}
                y2={wall.end.y}
                stroke={wall.isExternal ? '#ef4444' : '#1e293b'}
                strokeWidth={wall.isExternal ? wallStrokeExt : wallStroke}
                strokeLinecap="round"
              />
              {wall.type === 'window' && (
                <line
                  x1={wall.start.x}
                  y1={wall.start.y}
                  x2={wall.end.x}
                  y2={wall.end.y}
                  stroke="#3b82f6"
                  strokeWidth={wallStroke * 0.6}
                />
              )}
              {wall.type === 'door' && (
                <circle
                  cx={(wall.start.x + wall.end.x) / 2}
                  cy={(wall.start.y + wall.end.y) / 2}
                  r={handleRadius * 0.8}
                  fill="none"
                  stroke="#eab308"
                  strokeWidth={wallStroke * 0.4}
                />
              )}
            </g>
          );
        })}

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
        {remodelZone && (
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

        {/* Interactive Calibration Ruler */}
        {mode === 'CALIBRATE' && (
          <g>
            {/* Connecting Line */}
            <line
              x1={calibrationRuler.start.x}
              y1={calibrationRuler.start.y}
              x2={calibrationRuler.end.x}
              y2={calibrationRuler.end.y}
              stroke="#f43f5e"
              strokeWidth={rulerStroke}
              strokeDasharray={`${rulerStroke * 2},${rulerStroke}`}
            />

            {/* Start Handle */}
            <circle
              cx={calibrationRuler.start.x}
              cy={calibrationRuler.start.y}
              r={handleRadius}
              fill="#f43f5e"
              className="cursor-move"
              stroke="white"
              strokeWidth={2}
            />
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

            {/* End Handle */}
            <circle
              cx={calibrationRuler.end.x}
              cy={calibrationRuler.end.y}
              r={handleRadius}
              fill="#f43f5e"
              className="cursor-move"
              stroke="white"
              strokeWidth={2}
            />
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
        {scaleData.calibrated && (
          <div className="mt-2 text-slate-500 font-mono">
            Scale: 1ft = {scaleData.pixelsPerFoot.toFixed(2)}px
          </div>
        )}
      </div>
    </div>
  );
};

export default ArchitectCanvas;
