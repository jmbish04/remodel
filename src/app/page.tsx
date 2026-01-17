'use client';

import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import {
  Loader2,
  Upload,
  Ruler,
  PenTool,
  RotateCcw,
  MessageSquare,
  Download,
  Plus,
  CheckCircle,
  Calculator,
  History,
  Undo2,
  Clock,
  Wand2,
  Video,
  X,
  ArrowRight,
  DoorOpen,
  ScanLine,
  Compass,
  Trash2,
} from 'lucide-react';
import ArchitectCanvas from '@/components/ArchitectCanvas';
import PreviewImage from '@/components/PreviewImage';
import Header from '@/components/Header';
import FloorNameModal from '@/components/FloorNameModal';
import {
  digitizePlan,
  generate3D,
  computeRemodel,
  visualizeInterior,
  editDesign,
  generateVideoFrame,
  fileToBase64,
} from '@/lib/gemini';
import { Floor, HistoryEntry, AppStep, ChatMessage, VisualParams, Wall, Point, FloorPlanData, Rect, RulerData, OrientationData } from '@/types';

export default function Home() {
  // Floor Management
  const [floors, setFloors] = useState<Floor[]>([]);
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const [step, setStep] = useState<AppStep>(AppStep.PROJECT_OVERVIEW);

  // Wizard State
  const [totalFloors, setTotalFloors] = useState<number>(1);
  const [currentFloorIndex, setCurrentFloorIndex] = useState<number>(0);
  const [wizardHistory, setWizardHistory] = useState<FloorPlanData[]>([]);

  // Orientation Sub-Modes
  const [orientMode, setOrientMode] = useState<'DOOR' | 'GARAGE' | 'COMPASS'>('DOOR');

  // Label Review State
  const [isAddingRoom, setIsAddingRoom] = useState(false);

  // Selection State for Canvas interactions
  const [selectedElement, setSelectedElement] = useState<{ type: 'wall' | 'door' | null; id: string | null }>({ type: null, id: null });

  // Loading State
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // Floor Name Modal State
  const [showFloorNameModal, setShowFloorNameModal] = useState(false);
  const [pendingFloorData, setPendingFloorData] = useState<{
    base64: string;
    imgUrl: string;
    dims: { width: number; height: number };
  } | null>(null);

  // Calibration Inputs
  const [calFeet, setCalFeet] = useState<string>('10');
  const [calInches, setCalInches] = useState<string>('0');

  // Tab States
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');
  const [showVisualizer, setShowVisualizer] = useState(false);

  // Chat State
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  // Visual Generation State
  const [visualParams, setVisualParams] = useState<VisualParams>({
    perspective: 'isometric',
    style: 'photorealistic modern',
    roomName: 'Living Room',
    instruction: 'Add a modern red leather sofa to the center',
  });

  // Visual Results
  const [render3D, setRender3D] = useState<string | null>(null);
  const [interiorView, setInteriorView] = useState<string | null>(null);
  const [editedView, setEditedView] = useState<string | null>(null);
  const [videoFrame, setVideoFrame] = useState<string | null>(null);
  const [visualError, setVisualError] = useState<string | null>(null);

  // Helpers
  const activeFloor = floors.find((f) => f.id === activeFloorId);

  // Distance helper
  const getDistance = (p1: Point, p2: Point) => Math.hypot(p2.x - p1.x, p2.y - p1.y);

  // Reset wizard history when floor changes
  useEffect(() => {
    setWizardHistory([]);
    setIsAddingRoom(false);
  }, [activeFloorId, step]);

  // --- Wizard Undo ---
  const saveToHistory = () => {
    if (!activeFloor?.data) return;
    setWizardHistory((prev) => [...prev, JSON.parse(JSON.stringify(activeFloor.data))]);
  };

  const handleUndo = () => {
    if (wizardHistory.length === 0 || !activeFloor) return;
    const previous = wizardHistory[wizardHistory.length - 1];
    handleUpdateActiveFloor({ data: previous });
    setWizardHistory((prev) => prev.slice(0, -1));
  };

  // --- Wizard Step Logic ---
  const handleNextStep = () => {
    switch (step) {
      case AppStep.CALIBRATION:
        if (!activeFloor?.scaleData.calibrated) {
          alert('Please set the scale first.');
          return;
        }
        setStep(totalFloors > 1 ? AppStep.STAIR_MARKING : AppStep.CORRECTION_DOORS);
        break;
      case AppStep.STAIR_MARKING:
        setStep(AppStep.CORRECTION_DOORS);
        break;
      case AppStep.CORRECTION_DOORS:
        setStep(AppStep.CORRECTION_WALLS);
        break;
      case AppStep.CORRECTION_WALLS:
        setStep(AppStep.STRUCTURAL_ID);
        break;
      case AppStep.STRUCTURAL_ID:
        setStep(AppStep.EXTERIOR_CHECK);
        break;
      case AppStep.EXTERIOR_CHECK:
        setStep(AppStep.LABEL_REVIEW);
        break;
      case AppStep.LABEL_REVIEW:
        setStep(AppStep.SCALE_VERIFICATION_ROOMS);
        break;
      case AppStep.SCALE_VERIFICATION_ROOMS:
        setStep(AppStep.ORIENTATION);
        break;
      case AppStep.ORIENTATION:
        if (currentFloorIndex < totalFloors - 1) {
          setCurrentFloorIndex((prev) => prev + 1);
          setStep(AppStep.UPLOAD_FLOOR);
          setActiveFloorId(null);
        } else {
          setStep(AppStep.REMODEL);
          if (floors.length > 0) setActiveFloorId(floors[0].id);
        }
        break;
      default:
        break;
    }
  };

  // Check if we're in wizard mode
  const isWizardStep =
    step === AppStep.CALIBRATION ||
    step === AppStep.STAIR_MARKING ||
    step === AppStep.CORRECTION_DOORS ||
    step === AppStep.CORRECTION_WALLS ||
    step === AppStep.STRUCTURAL_ID ||
    step === AppStep.EXTERIOR_CHECK ||
    step === AppStep.LABEL_REVIEW ||
    step === AppStep.SCALE_VERIFICATION_ROOMS ||
    step === AppStep.ORIENTATION;

  // File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      e.target.value = '';

      setLoading(true);
      setLoadingMessage('Reading image...');
      try {
        const base64 = await fileToBase64(file);
        const imgUrl = `data:image/jpeg;base64,${base64}`;

        const img = new Image();
        img.onload = () => {
          const dims = { width: img.naturalWidth, height: img.naturalHeight };
          // Store pending data and show modal
          setPendingFloorData({ base64, imgUrl, dims });
          setShowFloorNameModal(true);
          setLoading(false);
        };
        img.onerror = () => {
          alert('Failed to load image dimensions.');
          setLoading(false);
        };
        img.src = imgUrl;
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : 'Failed to process image file.';
        alert(message);
        setLoading(false);
      }
    }
  };

  // Handle floor name submission from modal
  const handleFloorNameSubmit = async (floorName: string) => {
    setShowFloorNameModal(false);
    
    if (!pendingFloorData) return;
    
    const { base64, imgUrl, dims } = pendingFloorData;
    setPendingFloorData(null);
    
    setLoading(true);
    setLoadingMessage(`Digitizing ${floorName}...`);
    
    try {
      const data = await digitizePlan(base64, dims.width, dims.height);

      const rulerStart = { x: dims.width * 0.3, y: dims.height * 0.5 };
      const rulerEnd = { x: dims.width * 0.7, y: dims.height * 0.5 };
      const stairRect = { x: dims.width * 0.4, y: dims.height * 0.4, width: dims.width * 0.2, height: dims.height * 0.2 };
      const garageRuler = { start: { x: dims.width * 0.4, y: dims.height * 0.8 }, end: { x: dims.width * 0.6, y: dims.height * 0.8 } };

      const initialVersionId = crypto.randomUUID();
      const initialHistory: HistoryEntry = {
        id: initialVersionId,
        timestamp: Date.now(),
        description: 'Original Import',
        data: JSON.parse(JSON.stringify(data)),
      };

      const newFloor: Floor = {
        id: crypto.randomUUID(),
        name: floorName,
        imageSrc: imgUrl,
        imageDims: dims,
        data: data,
        scaleData: { pixelsPerFoot: 1, calibrated: false },
        remodelZone: null,
        calibrationRuler: { start: rulerStart, end: rulerEnd },
        garageRuler: garageRuler,
        stairLocation: stairRect,
        orientation: { frontAngle: 0 },
        history: [initialHistory],
        currentVersionId: initialVersionId,
      };

      setFloors((prev) => [...prev, newFloor]);
      setActiveFloorId(newFloor.id);
      setStep(AppStep.CALIBRATION);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'AI Processing Failed. Please try again.';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateActiveFloor = (updates: Partial<Floor>) => {
    setFloors((prev) => prev.map((f) => (f.id === activeFloorId ? { ...f, ...updates } : f)));
  };

  const handleApplyCalibration = () => {
    if (!activeFloor) return;
    const feet = parseFloat(calFeet) || 0;
    const inches = parseFloat(calInches) || 0;
    const totalFeet = feet + inches / 12;

    if (totalFeet <= 0) {
      alert('Please enter a valid length greater than 0.');
      return;
    }

    const dx = activeFloor.calibrationRuler.end.x - activeFloor.calibrationRuler.start.x;
    const dy = activeFloor.calibrationRuler.end.y - activeFloor.calibrationRuler.start.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);

    const pixelsPerFoot = pixelDistance / totalFeet;

    handleUpdateActiveFloor({
      scaleData: { pixelsPerFoot, calibrated: true },
    });
  };

  // --- Wizard Canvas Handlers ---
  const handleCanvasClick = (pt: Point) => {
    if (!activeFloor?.data) return;

    if (step === AppStep.CORRECTION_DOORS) {
      // Add a new door at the clicked location
      if (confirm('Create a new door at this location?')) {
        saveToHistory();
        const newDoor: Wall = {
          id: crypto.randomUUID(),
          start: { x: pt.x - 20, y: pt.y },
          end: { x: pt.x + 20, y: pt.y },
          type: 'door',
          doorType: 'entry',
          isExternal: false,
        };
        const newWalls = [...activeFloor.data.walls, newDoor];
        handleUpdateActiveFloor({ data: { ...activeFloor.data, walls: newWalls } });
      }
    } else if (step === AppStep.LABEL_REVIEW && isAddingRoom) {
      saveToHistory();
      const newRoom = { id: crypto.randomUUID(), name: 'New Room', labelPosition: pt };
      const newRooms = [...activeFloor.data.rooms, newRoom];
      handleUpdateActiveFloor({ data: { ...activeFloor.data, rooms: newRooms } });
      setIsAddingRoom(false);
    }
  };

  const handleWallClick = (wall: Wall) => {
    if (!activeFloor?.data) return;

    if (step === AppStep.ORIENTATION && orientMode === 'DOOR') {
      handleUpdateActiveFloor({ orientation: { ...activeFloor.orientation, frontDoorId: wall.id } });
    } else if (step === AppStep.STRUCTURAL_ID) {
      saveToHistory();
      const newWalls = activeFloor.data.walls.map((w) =>
        w.id === wall.id ? { ...w, isLoadBearing: !w.isLoadBearing, isExternal: !w.isExternal } : w
      );
      handleUpdateActiveFloor({ data: { ...activeFloor.data, walls: newWalls } });
    }
    setSelectedElement({ type: 'wall', id: wall.id });
  };

  const handleWallDraw = (start: Point, end: Point) => {
    if (!activeFloor?.data) return;
    saveToHistory();
    const newWall: Wall = { id: crypto.randomUUID(), start, end, type: 'wall', isExternal: false };
    handleUpdateActiveFloor({ data: { ...activeFloor.data, walls: [...activeFloor.data.walls, newWall] } });
  };

  const handleDeleteSelected = () => {
    if (!activeFloor?.data || !selectedElement.id) return;
    saveToHistory();
    const newWalls = activeFloor.data.walls.filter((w) => w.id !== selectedElement.id);
    handleUpdateActiveFloor({ data: { ...activeFloor.data, walls: newWalls } });
    setSelectedElement({ type: null, id: null });
  };

  const handleRulerUpdate = (ruler: RulerData, type?: 'calibration' | 'garage') => {
    if (!activeFloor) return;
    if (type === 'garage') {
      let widthFt = 0;
      if (activeFloor.scaleData.calibrated) {
        const pxDist = getDistance(ruler.start, ruler.end);
        widthFt = pxDist / activeFloor.scaleData.pixelsPerFoot;
      }
      handleUpdateActiveFloor({ garageRuler: ruler, orientation: { ...activeFloor.orientation, garageWidth: widthFt } });
    } else {
      handleUpdateActiveFloor({ calibrationRuler: ruler });
    }
  };

  const handleGenerateRemodel = async () => {
    if (!activeFloor?.data || !activeFloor.remodelZone || !chatInput.trim()) return;

    setLoading(true);
    setLoadingMessage('Architecting new layout...');
    const userMsg = chatInput;
    setChatInput('');
    setChatHistory((prev) => [...prev, { role: 'user', text: userMsg, timestamp: Date.now() }]);

    try {
      const newPlan = await computeRemodel(activeFloor.data, activeFloor.remodelZone, userMsg);
      if (activeFloor.data.width) newPlan.width = activeFloor.data.width;
      if (activeFloor.data.height) newPlan.height = activeFloor.data.height;

      const newVersionId = crypto.randomUUID();
      const newEntry: HistoryEntry = {
        id: newVersionId,
        timestamp: Date.now(),
        description: userMsg,
        data: JSON.parse(JSON.stringify(newPlan)),
      };

      const updatedHistory = [...activeFloor.history, newEntry];

      handleUpdateActiveFloor({
        data: newPlan,
        history: updatedHistory,
        currentVersionId: newVersionId,
      });

      setActiveTab('history');
      setChatHistory((prev) => [
        ...prev,
        { role: 'ai', text: "I've updated the layout. Check the History tab to verify.", timestamp: Date.now() },
      ]);
    } catch (e) {
      console.error(e);
      setChatHistory((prev) => [
        ...prev,
        { role: 'ai', text: 'Sorry, I encountered an error generating the remodel.', timestamp: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreVersion = (entryId: string) => {
    if (!activeFloor) return;
    const entry = activeFloor.history.find((h) => h.id === entryId);
    if (entry) {
      handleUpdateActiveFloor({
        data: JSON.parse(JSON.stringify(entry.data)),
        currentVersionId: entryId,
      });
    }
  };

  // Visual Generation Handlers
  const handleGenerate3D = async () => {
    if (!activeFloor?.imageSrc) return;
    setLoading(true);
    setLoadingMessage('Generating 3D render...');
    setVisualError(null);
    try {
      const result = await generate3D(activeFloor.imageSrc, visualParams.perspective, visualParams.style);
      setRender3D(result);
    } catch (err) {
      setVisualError(err instanceof Error ? err.message : 'Failed to generate 3D');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateInterior = async () => {
    const source = render3D || activeFloor?.imageSrc;
    if (!source) return;
    setLoading(true);
    setLoadingMessage('Generating interior view...');
    setVisualError(null);
    try {
      const result = await visualizeInterior(source, visualParams.roomName);
      setInteriorView(result);
    } catch (err) {
      setVisualError(err instanceof Error ? err.message : 'Failed to generate interior');
    } finally {
      setLoading(false);
    }
  };

  const handleEditDesign = async () => {
    const source = interiorView || render3D;
    if (!source) return;
    setLoading(true);
    setLoadingMessage('Applying design changes...');
    setVisualError(null);
    try {
      const result = await editDesign(source, visualParams.instruction);
      setEditedView(result);
    } catch (err) {
      setVisualError(err instanceof Error ? err.message : 'Failed to edit design');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateVideo = async () => {
    const source = editedView || interiorView || render3D;
    if (!source) return;
    setLoading(true);
    setLoadingMessage('Generating cinematic frame...');
    setVisualError(null);
    try {
      const result = await generateVideoFrame(source);
      setVideoFrame(result);
    } catch (err) {
      setVisualError(err instanceof Error ? err.message : 'Failed to generate video');
    } finally {
      setLoading(false);
    }
  };

  // Download handlers
  const downloadJson = () => {
    if (!activeFloor?.data) return;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(activeFloor.data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', `${activeFloor.name.replace(/\s/g, '_')}_blueprint.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const downloadPackage = async () => {
    if (!activeFloor) return;
    
    setLoading(true);
    setLoadingMessage('Creating download package...');
    
    try {
      const zip = new JSZip();
      const floorName = activeFloor.name.replace(/\s/g, '_');
      
      // Add blueprint JSON
      const blueprintData = {
        floor: activeFloor.name,
        blueprint: activeFloor.data,
        scale: activeFloor.scaleData,
        history: activeFloor.history,
      };
      zip.file(`${floorName}_blueprint.json`, JSON.stringify(blueprintData, null, 2));
      
      // Helper to extract base64 data and convert to blob
      const base64ToBlob = (base64: string): Uint8Array => {
        const base64Data = base64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
      };
      
      // Add original floorplan
      if (activeFloor.imageSrc) {
        zip.file(`${floorName}_original.png`, base64ToBlob(activeFloor.imageSrc));
      }
      
      // Add visualizations
      if (render3D) {
        zip.file(`${floorName}_3d_render.png`, base64ToBlob(render3D));
      }
      if (interiorView) {
        zip.file(`${floorName}_interior.png`, base64ToBlob(interiorView));
      }
      if (editedView) {
        zip.file(`${floorName}_edited.png`, base64ToBlob(editedView));
      }
      if (videoFrame) {
        zip.file(`${floorName}_video_frame.png`, base64ToBlob(videoFrame));
      }
      
      // Generate and download zip
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute('href', url);
      downloadAnchorNode.setAttribute('download', `${floorName}_package.zip`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Failed to create package.';
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  // --- Wizard Sidebar Component ---
  const WizardSidebar = () => {
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
          <p className="text-sm text-slate-500">{totalFloors > 1 ? `Floor ${currentFloorIndex + 1} of ${totalFloors}` : 'Main Floor Config'}</p>
        </div>

        <div className="flex-1 space-y-6">
          {/* Step Progress */}
          <div className="space-y-2 relative">
            <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-100"></div>
            {wizardSteps.map((s, idx) => {
              const isCurrent = step === s.id;
              const isPast = stepOrder.indexOf(step) > stepOrder.indexOf(s.id);
              return (
                <div key={idx} className={`relative flex items-center gap-3 p-2 rounded-lg transition-colors ${isCurrent ? 'bg-blue-50 text-blue-800' : 'text-slate-500'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center z-10 text-xs font-bold ${isCurrent ? 'bg-blue-600 text-white' : isPast ? 'bg-green-500 text-white' : 'bg-slate-200'}`}>
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
                  onClick={() => setIsAddingRoom(!isAddingRoom)}
                  className={`text-xs px-2 py-1 rounded border flex items-center gap-1 ${isAddingRoom ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>

              {isAddingRoom && <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded mb-2 animate-pulse border border-blue-100">Click on the canvas to place a new label.</div>}

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {activeFloor.data.rooms.map((room) => (
                  <div key={room.id} className="flex items-center gap-2 text-sm">
                    <input
                      className="border rounded px-2 py-1 w-24 text-xs bg-white text-slate-900"
                      value={room.name}
                      onChange={(e) => {
                        if (!activeFloor.data) return;
                        const newRooms = activeFloor.data.rooms.map((r) => (r.id === room.id ? { ...r, name: e.target.value } : r));
                        handleUpdateActiveFloor({ data: { ...activeFloor.data, rooms: newRooms } });
                      }}
                    />
                    <button
                      onClick={() => {
                        if (!activeFloor.data) return;
                        saveToHistory();
                        const newRooms = activeFloor.data.rooms.filter((r) => r.id !== room.id);
                        handleUpdateActiveFloor({ data: { ...activeFloor.data, rooms: newRooms } });
                      }}
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
              <p className="text-xs text-slate-500 mb-3">Drag the red ruler on the canvas to verify specific room dimensions.</p>
            </div>
          )}

          {/* Orientation Controls */}
          {step === AppStep.ORIENTATION && (
            <div className="border-t pt-4 space-y-2">
              <button
                onClick={() => setOrientMode('DOOR')}
                className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-sm ${orientMode === 'DOOR' ? 'bg-blue-100 text-blue-800' : 'hover:bg-slate-50'}`}
              >
                <DoorOpen className="w-4 h-4" /> Select Front Door
              </button>
              <button
                onClick={() => setOrientMode('GARAGE')}
                className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-sm ${orientMode === 'GARAGE' ? 'bg-purple-100 text-purple-800' : 'hover:bg-slate-50'}`}
              >
                <ScanLine className="w-4 h-4" /> Measure Garage Width
              </button>
              {activeFloor?.orientation?.garageWidth && activeFloor.orientation.garageWidth > 0 && (
                <div className="text-xs text-purple-700 bg-purple-50 p-2 rounded ml-4 border border-purple-100">
                  Width: <strong>{activeFloor.orientation.garageWidth.toFixed(1)} ft</strong>
                </div>
              )}
              <button
                onClick={() => setOrientMode('COMPASS')}
                className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-sm ${orientMode === 'COMPASS' ? 'bg-red-100 text-red-800' : 'hover:bg-slate-50'}`}
              >
                <Compass className="w-4 h-4" /> Set Front Direction
              </button>
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 border-t border-slate-100">
          {wizardHistory.length > 0 && (
            <button onClick={handleUndo} className="w-full mb-3 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2 rounded flex items-center justify-center gap-2 text-sm font-medium transition-colors">
              <Undo2 className="w-4 h-4" /> Undo Last Change
            </button>
          )}
          {selectedElement.id && (
            <button onClick={handleDeleteSelected} className="w-full mb-3 bg-red-100 text-red-700 p-2 rounded flex items-center justify-center gap-2 text-sm hover:bg-red-200 font-medium">
              <Trash2 className="w-4 h-4" /> Delete Selected
            </button>
          )}
          <button onClick={handleNextStep} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all active:scale-95">
            Next Step <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50">
      <Header 
        activeFloorName={activeFloor?.name}
        showVisualizer={showVisualizer}
        onToggleVisualizer={() => setShowVisualizer(!showVisualizer)}
      />

      <main className="flex-1 flex overflow-hidden">
        {/* Wizard Sidebar - shown during wizard steps */}
        {isWizardStep && activeFloor && <WizardSidebar />}

        {/* Sidebar: Floor List - shown when NOT in wizard mode */}
        {!isWizardStep && (
          <div className="w-64 bg-white border-r border-slate-200 flex flex-col z-10 hidden md:flex">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-semibold text-slate-700">Floors</h3>
              <label className="cursor-pointer p-1 hover:bg-slate-100 rounded text-blue-600">
                <Plus className="w-5 h-5" />
                <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
              </label>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {floors.length === 0 && <div className="text-center p-4 text-slate-400 text-sm italic">No floors yet. Upload a plan to start.</div>}
              {floors.map((floor) => (
                <button
                  key={floor.id}
                  onClick={() => {
                    setActiveFloorId(floor.id);
                    setStep(AppStep.REMODEL);
                  }}
                  className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition ${activeFloorId === floor.id ? 'bg-blue-50 border-blue-200 border text-blue-800' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                  <div className={`w-2 h-2 rounded-full ${floor.scaleData.calibrated ? 'bg-green-500' : 'bg-yellow-400'}`}></div>
                  <span className="font-medium truncate">{floor.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Center: Canvas or Visualizer */}
        <div className="flex-1 p-6 relative bg-gray-200/50 flex flex-col">
          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-xl">
              <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
              <p className="text-slate-700 font-medium animate-pulse">{loadingMessage}</p>
            </div>
          )}

          {showVisualizer ? (
            /* VISUALIZER MODE */
            <div className="flex-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-900">Visual Pipeline</h2>
                <div className="flex items-center gap-2">
                  <button onClick={downloadPackage} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-700">
                    <Download className="w-4 h-4" />
                    Download Package
                  </button>
                </div>
              </div>

              {visualError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                  <X className="w-4 h-4" />
                  <span className="text-sm">{visualError}</span>
                  <button onClick={() => setVisualError(null)} className="ml-auto">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Visual Controls */}
              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">Perspective</label>
                  <select
                    value={visualParams.perspective}
                    onChange={(e) => setVisualParams((p) => ({ ...p, perspective: e.target.value as 'isometric' | 'top-down' }))}
                    className="w-full text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2"
                  >
                    <option value="isometric">Isometric</option>
                    <option value="top-down">Top-Down</option>
                  </select>
                  <button onClick={handleGenerate3D} disabled={loading || !activeFloor} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 text-sm flex items-center justify-center gap-2">
                    <Wand2 size={14} />
                    Generate 3D
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">Room Name</label>
                  <input
                    type="text"
                    value={visualParams.roomName}
                    onChange={(e) => setVisualParams((p) => ({ ...p, roomName: e.target.value }))}
                    className="w-full text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2"
                  />
                  <button onClick={handleGenerateInterior} disabled={loading || !render3D} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 text-sm flex items-center justify-center gap-2">
                    <Wand2 size={14} />
                    Enter Room
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">Edit Instruction</label>
                  <input
                    type="text"
                    value={visualParams.instruction}
                    onChange={(e) => setVisualParams((p) => ({ ...p, instruction: e.target.value }))}
                    className="w-full text-sm bg-gray-50 border border-gray-200 rounded-md px-3 py-2"
                  />
                  <button onClick={handleEditDesign} disabled={loading || !interiorView} className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 text-sm flex items-center justify-center gap-2">
                    <Wand2 size={14} />
                    Apply Edit
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-500">Cinematic</label>
                  <div className="h-8" />
                  <button onClick={handleGenerateVideo} disabled={loading || (!editedView && !interiorView)} className="w-full py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-purple-300 text-sm flex items-center justify-center gap-2">
                    <Video size={14} />
                    Render Clip
                  </button>
                </div>
              </div>

              {/* Visual Gallery */}
              <div className="grid grid-cols-2 gap-6">
                <PreviewImage src={activeFloor?.imageSrc || null} label="Original Floorplan" />
                <PreviewImage src={render3D} label="3D Render" />
                <PreviewImage src={interiorView} label="Interior View" />
                <PreviewImage src={editedView} label="Edited Design" />
              </div>

              {/* Video Section */}
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Video Output</h4>
                <div className="relative bg-gray-900 rounded-xl overflow-hidden aspect-[21/9] flex items-center justify-center">
                  {videoFrame ? (
                    <>
                      <img src={videoFrame} alt="Video Frame" className="w-full h-full object-cover opacity-80" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-transform">
                          <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[18px] border-l-white border-b-[10px] border-b-transparent ml-1"></div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-600 flex flex-col items-center">
                      <Video size={48} className="mb-3 opacity-30" />
                      <span className="text-sm">Video not generated</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : !activeFloor ? (
            /* UPLOAD MODE */
            <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl bg-slate-100 mx-10 my-10">
              <Upload className="w-16 h-16 text-slate-400 mb-4" />
              <h3 className="text-xl font-semibold text-slate-700">Upload a Floor Plan</h3>
              <p className="text-slate-500 mb-6">Start by uploading a single floor image (JPG/PNG)</p>
              <label className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg cursor-pointer transition shadow-lg flex items-center gap-2">
                <Plus className="w-5 h-5" />
                <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                Add New Floor
              </label>
            </div>
          ) : (
            /* CANVAS MODE */
            <>
              {/* Toolbar */}
              <div className="mb-4 bg-white p-2 rounded-lg shadow-sm flex items-center gap-4 flex-wrap">
                {!activeFloor.scaleData.calibrated ? (
                  <div className="flex items-center gap-3 bg-red-50 p-2 rounded border border-red-200 w-full sm:w-auto">
                    <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
                      <Ruler className="w-4 h-4" />
                      <span>Calibration:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={calFeet}
                        onChange={(e) => setCalFeet(e.target.value)}
                        className="w-16 p-1 border rounded text-sm text-center bg-white text-slate-900"
                        placeholder="Ft"
                      />
                      <span className="text-xs text-slate-500">ft</span>
                      <input
                        type="number"
                        min="0"
                        value={calInches}
                        onChange={(e) => setCalInches(e.target.value)}
                        className="w-16 p-1 border rounded text-sm text-center bg-white text-slate-900"
                        placeholder="In"
                      />
                      <span className="text-xs text-slate-500">in</span>
                    </div>
                    <button onClick={handleApplyCalibration} className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded font-medium transition">
                      Set Scale
                    </button>
                    <span className="text-xs text-slate-500 italic hidden sm:inline">Drag the red ruler points to a known wall.</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 text-sm text-green-700 px-3 py-1 bg-green-50 border border-green-200 rounded">
                      <CheckCircle className="w-4 h-4" /> Scale Set
                    </div>
                    <div className="h-4 w-px bg-slate-300 mx-2"></div>
                    <button onClick={() => handleUpdateActiveFloor({ remodelZone: null })} className="text-xs flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded text-slate-700">
                      <RotateCcw className="w-3 h-3" /> Reset Zone
                    </button>
                    <button onClick={() => handleUpdateActiveFloor({ scaleData: { ...activeFloor.scaleData, calibrated: false } })} className="text-xs flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded text-slate-700">
                      <Calculator className="w-3 h-3" /> Recalibrate
                    </button>
                    <span className="text-xs text-slate-500">Drag to define Remodel Zone</span>
                  </div>
                )}
                <div className="flex-1"></div>
                <button onClick={downloadJson} className="p-2 text-slate-500 hover:text-slate-800">
                  <Download className="w-4 h-4" />
                </button>
              </div>

              {/* Canvas Container */}
              <div className="flex-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden relative">
                <ArchitectCanvas
                  imageSrc={activeFloor.imageSrc}
                  imageDims={activeFloor.imageDims}
                  data={activeFloor.data}
                  mode={isWizardStep ? step : !activeFloor.scaleData.calibrated ? 'CALIBRATE' : step === AppStep.REMODEL ? AppStep.REMODEL : 'ZONE'}
                  scaleData={activeFloor.scaleData}
                  onDataUpdate={(data) => handleUpdateActiveFloor({ data })}
                  onZoneUpdate={(zone) => handleUpdateActiveFloor({ remodelZone: zone })}
                  onRulerUpdate={handleRulerUpdate}
                  onStairUpdate={(rect) => handleUpdateActiveFloor({ stairLocation: rect })}
                  onOrientationUpdate={(o) => handleUpdateActiveFloor({ orientation: o })}
                  onSelect={(type, id) => setSelectedElement({ type: type as 'wall' | 'door' | null, id })}
                  onWallClick={handleWallClick}
                  onCanvasClick={handleCanvasClick}
                  onWallDraw={handleWallDraw}
                  remodelZone={activeFloor.remodelZone}
                  calibrationRuler={activeFloor.calibrationRuler}
                  garageRuler={activeFloor.garageRuler}
                  stairRect={activeFloor.stairLocation}
                  orientation={activeFloor.orientation}
                  selectedId={selectedElement.id}
                />
              </div>
            </>
          )}
        </div>

        {/* RIGHT PANEL: Co-Pilot & History - only shown for REMODEL step */}
        {activeFloor && !showVisualizer && !isWizardStep && (
          <div className="w-80 bg-white border-l border-slate-200 flex flex-col z-10">
            {/* Tabs */}
            <div className="flex border-b border-slate-200">
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${
                  activeTab === 'chat' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <MessageSquare className="w-4 h-4" /> Co-pilot
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${
                  activeTab === 'history' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <History className="w-4 h-4" /> History
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
              {activeTab === 'chat' ? (
                <>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                    {chatHistory.length === 0 && (
                      <div className="text-sm text-slate-400 text-center mt-10 italic px-4">
                        {!activeFloor.scaleData.calibrated ? 'Use the red ruler to set the scale.' : 'Draw a zone, then tell me what to change.'}
                      </div>
                    )}
                    {chatHistory.map((msg, i) => (
                      <div key={i} className={`p-3 rounded-lg text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white ml-8 shadow-sm' : 'bg-white border border-slate-200 mr-8 text-slate-700 shadow-sm'}`}>
                        {msg.text}
                      </div>
                    ))}
                  </div>

                  <div className="p-4 border-t border-slate-200 bg-white">
                    {!activeFloor.scaleData.calibrated ? (
                      <div className="text-center p-3 bg-red-50 text-red-800 text-xs rounded border border-red-200">Set scale first.</div>
                    ) : !activeFloor.remodelZone ? (
                      <div className="bg-orange-50 text-orange-700 text-xs p-3 rounded border border-orange-200 text-center">Draw a Remodel Zone box.</div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <textarea
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          placeholder="E.g. Remove the closet..."
                          className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none h-20 bg-white text-slate-900"
                        />
                        <button
                          onClick={handleGenerateRemodel}
                          disabled={loading || !chatInput.trim()}
                          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
                        >
                          {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <PenTool className="w-4 h-4" />}
                          Generate
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* HISTORY TAB */
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {activeFloor.history.length === 0 ? (
                    <div className="text-slate-400 text-sm text-center italic mt-10">No history available</div>
                  ) : (
                    <div className="space-y-4 relative">
                      <div className="absolute left-3.5 top-2 bottom-2 w-0.5 bg-slate-200"></div>
                      {activeFloor.history.map((entry, idx) => {
                        const isActive = entry.id === activeFloor.currentVersionId;
                        return (
                          <div key={entry.id} className="relative pl-8">
                            <div className={`absolute left-2 top-2 w-3.5 h-3.5 rounded-full border-2 ${isActive ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'}`}></div>
                            <div className={`p-3 rounded-lg border transition-all ${isActive ? 'bg-white border-blue-500 shadow-md ring-1 ring-blue-100' : 'bg-white border-slate-200 hover:border-blue-300'}`}>
                              <div className="flex justify-between items-start mb-1">
                                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Version {idx + 1}</span>
                                {isActive && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">Active</span>}
                              </div>
                              <p className="text-sm font-medium text-slate-800 mb-2">{entry.description}</p>
                              <div className="flex justify-between items-center mt-2">
                                <span className="text-xs text-slate-400 flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {!isActive && (
                                  <button onClick={() => handleRestoreVersion(entry.id)} className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition">
                                    <Undo2 className="w-3 h-3" /> Restore
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      
      {/* Floor Name Modal */}
      <FloorNameModal
        isOpen={showFloorNameModal}
        onClose={() => {
          setShowFloorNameModal(false);
          setPendingFloorData(null);
        }}
        onSubmit={handleFloorNameSubmit}
      />
    </div>
  );
}
