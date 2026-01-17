'use client';

import React from 'react';
import {
  CheckCircle,
  Plus,
  Undo2,
  ArrowRight,
  DoorOpen,
  ScanLine,
  Compass,
  Trash2,
} from 'lucide-react';
import { Floor, FloorPlanData, AppStep } from '@/types';

interface WizardSidebarProps {
  step: AppStep;
  totalFloors: number;
  currentFloorIndex: number;
  activeFloor: Floor | undefined;
  wizardHistory: FloorPlanData[];
  selectedElementId: string | null;
  isAddingRoom: boolean;
  orientMode: 'DOOR' | 'GARAGE' | 'COMPASS';
  onSetIsAddingRoom: (adding: boolean) => void;
  onSetOrientMode: (mode: 'DOOR' | 'GARAGE' | 'COMPASS') => void;
  onUndo: () => void;
  onDeleteSelected: () => void;
  onNextStep: () => void;
  onUpdateRoomName: (roomId: string, name: string) => void;
  onDeleteRoom: (roomId: string) => void;
}

const WizardSidebar: React.FC<WizardSidebarProps> = ({
  step,
  totalFloors,
  currentFloorIndex,
  activeFloor,
  wizardHistory,
  selectedElementId,
  isAddingRoom,
  orientMode,
  onSetIsAddingRoom,
  onSetOrientMode,
  onUndo,
  onDeleteSelected,
  onNextStep,
  onUpdateRoomName,
  onDeleteRoom,
}) => {
  const wizardSteps = [
    { id: AppStep.CALIBRATION, label: 'Scale' },
    ...(totalFloors > 1 ? [{ id: AppStep.STAIR_MARKING, label: 'Stairs' }] : []),
    { id: AppStep.CORRECTION_DOORS, label: 'Doors' },
    { id: AppStep.CORRECTION_WALLS, label: 'Walls' },
    { id: AppStep.STRUCTURAL_ID, label: 'Structural' },
    { id: AppStep.EXTERIOR_CHECK, label: 'Exterior' },
    { id: AppStep.LABEL_REVIEW, label: 'Labels' },
    { id: AppStep.SCALE_VERIFICATION_ROOMS, label: 'Room Verify' },
    { id: AppStep.ORIENTATION, label: 'Orientation' },
  ];

  const stepOrder = wizardSteps.map((s) => s.id);

  return (
    <div className="w-80 bg-white border-r border-slate-200 flex flex-col z-10 p-6 shadow-xl overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800 mb-1">Floor Setup</h2>
        <p className="text-sm text-slate-500">
          {totalFloors > 1 ? `Floor ${currentFloorIndex + 1} of ${totalFloors}` : 'Main Floor Config'}
        </p>
      </div>

      <div className="flex-1 space-y-6">
        {/* Step Progress */}
        <div className="space-y-2 relative">
          <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-100"></div>
          {wizardSteps.map((s, idx) => {
            const isCurrent = step === s.id;
            const isPast = stepOrder.indexOf(step) > stepOrder.indexOf(s.id);
            return (
              <div
                key={idx}
                className={`relative flex items-center gap-3 p-2 rounded-lg transition-colors ${
                  isCurrent ? 'bg-blue-50 text-blue-800' : 'text-slate-500'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center z-10 text-xs font-bold ${
                    isCurrent ? 'bg-blue-600 text-white' : isPast ? 'bg-green-500 text-white' : 'bg-slate-200'
                  }`}
                >
                  {isPast ? <CheckCircle className="w-3 h-3" /> : idx + 1}
                </div>
                <span className={`text-sm font-medium ${isCurrent ? 'font-bold' : ''}`}>{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* Label Review Controls */}
        {step === AppStep.LABEL_REVIEW && activeFloor?.data && (
          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-sm text-slate-900">Room Labels</h3>
              <button
                onClick={() => onSetIsAddingRoom(!isAddingRoom)}
                className={`text-xs px-2 py-1 rounded border flex items-center gap-1 ${
                  isAddingRoom ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>

            {isAddingRoom && (
              <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded mb-2 animate-pulse border border-blue-100">
                Click on the canvas to place a new label.
              </div>
            )}

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {activeFloor.data.rooms.map((room) => (
                <div key={room.id} className="flex items-center gap-2 text-sm">
                  <input
                    className="border rounded px-2 py-1 w-24 text-xs bg-white text-slate-900"
                    value={room.name}
                    onChange={(e) => onUpdateRoomName(room.id, e.target.value)}
                  />
                  <button
                    onClick={() => onDeleteRoom(room.id)}
                    className="text-red-400 hover:text-red-600 ml-auto"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scale Verification Controls */}
        {step === AppStep.SCALE_VERIFICATION_ROOMS && activeFloor?.data && (
          <div className="border-t pt-4">
            <p className="text-xs text-slate-500 mb-3">
              Drag the red ruler on the canvas to verify specific room dimensions.
            </p>
          </div>
        )}

        {/* Orientation Controls */}
        {step === AppStep.ORIENTATION && (
          <div className="border-t pt-4 space-y-2">
            <button
              onClick={() => onSetOrientMode('DOOR')}
              className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-sm ${
                orientMode === 'DOOR' ? 'bg-blue-100 text-blue-800' : 'hover:bg-slate-50'
              }`}
            >
              <DoorOpen className="w-4 h-4" /> Select Front Door
            </button>
            <button
              onClick={() => onSetOrientMode('GARAGE')}
              className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-sm ${
                orientMode === 'GARAGE' ? 'bg-purple-100 text-purple-800' : 'hover:bg-slate-50'
              }`}
            >
              <ScanLine className="w-4 h-4" /> Measure Garage Width
            </button>
            {activeFloor?.orientation?.garageWidth && activeFloor.orientation.garageWidth > 0 && (
              <div className="text-xs text-purple-700 bg-purple-50 p-2 rounded ml-4 border border-purple-100">
                Width: <strong>{activeFloor.orientation.garageWidth.toFixed(1)} ft</strong>
              </div>
            )}
            <button
              onClick={() => onSetOrientMode('COMPASS')}
              className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-sm ${
                orientMode === 'COMPASS' ? 'bg-red-100 text-red-800' : 'hover:bg-slate-50'
              }`}
            >
              <Compass className="w-4 h-4" /> Set Front Direction
            </button>
          </div>
        )}
      </div>

      <div className="mt-auto pt-4 border-t border-slate-100">
        {wizardHistory.length > 0 && (
          <button
            onClick={onUndo}
            className="w-full mb-3 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2 rounded flex items-center justify-center gap-2 text-sm font-medium transition-colors"
          >
            <Undo2 className="w-4 h-4" /> Undo Last Change
          </button>
        )}
        {selectedElementId && (
          <button
            onClick={onDeleteSelected}
            className="w-full mb-3 bg-red-100 text-red-700 p-2 rounded flex items-center justify-center gap-2 text-sm hover:bg-red-200 font-medium"
          >
            <Trash2 className="w-4 h-4" /> Delete Selected
          </button>
        )}
        <button
          onClick={onNextStep}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all active:scale-95"
        >
          Next Step <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default WizardSidebar;
