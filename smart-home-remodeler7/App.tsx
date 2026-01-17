import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AppStep, Floor, RemodelZone, RulerData, HistoryEntry, Wall, Point, Rect, OrientationData, FloorPlanData, VisualAsset } from './types';
import PlanCanvas from './components/PlanCanvas';
import { digitizeFloorPlan, fileToGenerativePart, generateRemodelOptions, generateVisualisation } from './services/geminiService';
import { uploadToCloudflare, CloudflareConfig } from './services/cloudflareService';
import { Loader2, Upload, Ruler, PenTool, RotateCcw, MessageSquare, Download, Layers, Plus, Map, CheckCircle, Calculator, History, Undo2, Clock, Cloud, ChevronRight, X, Trash2, ShieldCheck, DoorOpen, Home, Move, ArrowRight, ScanLine, Compass, Edit2, Tag, Save, Eye, Video, Cuboid } from 'lucide-react';

// --- Modal Interface ---
interface ModalConfig {
    type: 'DOOR_TYPE' | 'SCALE_VERIFY' | 'CONFIRM' | 'INFO' | 'VISUAL_VIEW';
    title: string;
    message?: string;
    data?: any;
    onConfirm?: (val?: any) => void;
    onCancel?: () => void;
}

const App: React.FC = () => {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const [step, setStep] = useState<AppStep>(AppStep.ONBOARDING);
  
  // Wizard State
  const [totalFloors, setTotalFloors] = useState<number>(1);
  const [currentFloorIndex, setCurrentFloorIndex] = useState<number>(0);
  const [showExteriorWarning, setShowExteriorWarning] = useState(false);
  const [wizardHistory, setWizardHistory] = useState<FloorPlanData[]>([]);
  
  // Modal State
  const [modalConfig, setModalConfig] = useState<ModalConfig | null>(null);
  const [modalInput, setModalInput] = useState<string>("");

  // Orientation Sub-Modes
  const [orientMode, setOrientMode] = useState<'DOOR' | 'GARAGE' | 'COMPASS'>('DOOR');
  
  // Label Review State
  const [isAddingRoom, setIsAddingRoom] = useState(false);

  // Selection State for Canvas interactions
  const [selectedElement, setSelectedElement] = useState<{type: 'wall'|'door'|null, id: string|null}>({type: null, id: null});

  // Loading State
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  
  // Calibration Inputs
  const [calFeet, setCalFeet] = useState<string>("10");
  const [calInches, setCalInches] = useState<string>("0");

  // Cloudflare Settings
  const [cfConfig, setCfConfig] = useState<CloudflareConfig>({ accountId: '', apiToken: '' });
  const [showCfSettings, setShowCfSettings] = useState(false);

  // Chat State
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'ai', text: string}[]>([]);

  // Helpers
  const activeFloor = floors.find(f => f.id === activeFloorId);

  // Reset wizard history when floor changes
  useEffect(() => {
    setWizardHistory([]);
    setIsAddingRoom(false);
  }, [activeFloorId, step]);

  // --- Logic Helpers ---
  const getDistance = (p1: Point, p2: Point) => Math.hypot(p2.x - p1.x, p2.y - p1.y);
  
  // Helper to capture the current state of the SVG canvas as a base64 string
  const captureCanvas = async (): Promise<string> => {
      return new Promise((resolve, reject) => {
          const svg = document.getElementById('main-plan-svg') as unknown as SVGSVGElement;
          if (!svg) { reject("Canvas not found"); return; }
          
          const serializer = new XMLSerializer();
          const svgStr = serializer.serializeToString(svg);
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          const img = new Image();
          img.onload = () => {
              canvas.width = svg.viewBox.baseVal.width || 1000;
              canvas.height = svg.viewBox.baseVal.height || 1000;
              if (ctx) {
                  ctx.fillStyle = "white";
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(img, 0, 0);
                  resolve(canvas.toDataURL('image/png').split(',')[1]);
              } else {
                  reject("Context error");
              }
          };
          img.onerror = reject;
          img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
      });
  };

  // Geometry: Ray Casting for Room Dimensions
  const calculateRoomDimensions = (center: Point, walls: Wall[], scale: number): string => {
    if (scale <= 0) return "--";

    // Helper: Cast ray in direction (dx, dy) and return distance to nearest wall
    const cast = (dx: number, dy: number): number => {
        let minDist = Infinity;
        walls.forEach(w => {
            const x1 = w.start.x, y1 = w.start.y;
            const x2 = w.end.x, y2 = w.end.y;
            const x3 = center.x, y3 = center.y;
            const x4 = center.x + dx * 10000, y4 = center.y + dy * 10000; // Far point

            const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
            if (den === 0) return;

            const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
            const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;

            if (t >= 0 && t <= 1 && u > 0) {
                // Distance = u * RayLength (10000)
                const dist = u * 10000;
                if (dist < minDist) minDist = dist;
            }
        });
        return minDist === Infinity ? 0 : minDist;
    };

    // SVG Coords: Y is down.
    const distUp = cast(0, -1);
    const distDown = cast(0, 1);
    const distLeft = cast(-1, 0);
    const distRight = cast(1, 0);

    // Total Dimensions
    const widthPx = distLeft + distRight;
    const heightPx = distUp + distDown;

    if (widthPx === 0 || heightPx === 0) return "Open";

    const widthFt = (widthPx / scale).toFixed(1);
    const heightFt = (heightPx / scale).toFixed(1);

    return `${widthFt}' x ${heightFt}'`;
  };

  const getEstimatedRoomDims = (roomLabelPos: Point, walls: Wall[]) => {
      if (!activeFloor?.scaleData.calibrated) return "?? x ??";
      return calculateRoomDimensions(roomLabelPos, walls, activeFloor.scaleData.pixelsPerFoot);
  };

  // --- Wizard Undo/Redo ---
  const saveToHistory = () => {
      if (!activeFloor?.data) return;
      setWizardHistory(prev => [...prev, JSON.parse(JSON.stringify(activeFloor.data))]);
  };

  const handleUndo = () => {
      if (wizardHistory.length === 0 || !activeFloor) return;
      const previous = wizardHistory[wizardHistory.length - 1];
      handleUpdateActiveFloor({ data: previous });
      setWizardHistory(prev => prev.slice(0, -1));
  };

  // --- Visual AI Logic ---
  const handleGenerate3D = async () => {
      if (!activeFloor) return;
      setLoading(true);
      setLoadingMessage("Generating 3D Isometric Render...");
      try {
          const canvasBase64 = await captureCanvas();
          const prompt = "Transform this 2D floor plan into a high-quality isometric 3D floor plan render. realistic lighting, materials, white walls, oak flooring, soft shadows. 4k resolution.";
          const resultBase64 = await generateVisualisation(prompt, canvasBase64);
          
          const newVisual: VisualAsset = {
              id: crypto.randomUUID(), type: '3d-iso', url: `data:image/png;base64,${resultBase64}`, prompt, timestamp: Date.now()
          };
          
          handleUpdateActiveFloor({ visuals: [...(activeFloor.visuals || []), newVisual] });
          setModalConfig({ type: 'VISUAL_VIEW', title: "3D Visualisation", data: newVisual });
      } catch (e) {
          console.error(e);
          alert("Failed to generate 3D view.");
      } finally {
          setLoading(false);
      }
  };

  const handleVisualizeRoom = async (roomId: string, roomName: string) => {
      if (!activeFloor) return;
      setLoading(true);
      setLoadingMessage(`Visualizing ${roomName}...`);
      try {
          const canvasBase64 = await captureCanvas();
          const prompt = `A photorealistic first-person wide-angle view of a modern ${roomName}. Use the floor plan layout provided. High end interior design, warm lighting, architectural photography style.`;
          const resultBase64 = await generateVisualisation(prompt, canvasBase64);
          
          const newVisual: VisualAsset = {
              id: crypto.randomUUID(), type: 'interior', url: `data:image/png;base64,${resultBase64}`, prompt, roomId, timestamp: Date.now()
          };
          
          handleUpdateActiveFloor({ visuals: [...(activeFloor.visuals || []), newVisual] });
          setModalConfig({ type: 'VISUAL_VIEW', title: `${roomName} - Interior View`, data: newVisual });
      } catch (e) {
          console.error(e);
          alert("Failed to visualize room.");
      } finally {
          setLoading(false);
      }
  };

  const handleGenerateCinematic = async () => {
       if (!activeFloor) return;
       setLoading(true);
       setLoadingMessage("Rendering Cinematic Shot...");
       try {
           const canvasBase64 = await captureCanvas();
           const prompt = "Cinematic wide shot of the entire home interior, depth of field, architectural digest style, warm sunlight streaming through windows. Photorealistic.";
           const resultBase64 = await generateVisualisation(prompt, canvasBase64);
           
           const newVisual: VisualAsset = {
               id: crypto.randomUUID(), type: 'cinematic', url: `data:image/png;base64,${resultBase64}`, prompt, timestamp: Date.now()
           };
           
           handleUpdateActiveFloor({ visuals: [...(activeFloor.visuals || []), newVisual] });
           setModalConfig({ type: 'VISUAL_VIEW', title: "Cinematic Preview", data: newVisual });
       } catch (e) {
           console.error(e);
           alert("Failed to generate cinematic.");
       } finally {
           setLoading(false);
       }
  };

  // --- Actions ---

  const handleStartProject = (numFloors: number) => {
      setTotalFloors(numFloors);
      setCurrentFloorIndex(0);
      setStep(AppStep.UPLOAD_LOOP);
  };

  const handleExportProject = () => {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(floors, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "smart_remodel_project.json");
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  };

  const handleNextStep = () => {
      switch (step) {
          case AppStep.SCALE_VERIFICATION:
              if (!activeFloor?.scaleData.calibrated) { alert("Please set the scale first."); return; }
              setStep(totalFloors > 1 ? AppStep.STAIR_MARKING : AppStep.CORRECTION_DOORS);
              break;
          case AppStep.STAIR_MARKING: setStep(AppStep.CORRECTION_DOORS); break;
          case AppStep.CORRECTION_DOORS: setStep(AppStep.CORRECTION_WALLS); break;
          case AppStep.CORRECTION_WALLS: setStep(AppStep.STRUCTURAL_ID); break;
          case AppStep.STRUCTURAL_ID:
              setStep(AppStep.EXTERIOR_CHECK);
              const hasWindows = activeFloor?.data?.walls.some(w => w.isExternal && w.type === 'window');
              if (!hasWindows) setShowExteriorWarning(true);
              break;
          case AppStep.EXTERIOR_CHECK: setStep(AppStep.LABEL_REVIEW); break;
          case AppStep.LABEL_REVIEW: setStep(AppStep.SCALE_VERIFICATION_ROOMS); break;
          case AppStep.SCALE_VERIFICATION_ROOMS: setStep(AppStep.ORIENTATION); break;
          case AppStep.ORIENTATION:
              if (currentFloorIndex < totalFloors - 1) {
                  setCurrentFloorIndex(prev => prev + 1);
                  setStep(AppStep.UPLOAD_LOOP);
                  setActiveFloorId(null);
              } else {
                  setStep(AppStep.REMODEL);
                  setActiveFloorId(floors[0].id);
              }
              break;
          default: break;
      }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      e.target.value = '';
      setLoading(true);
      setLoadingMessage("Reading image...");
      try {
        const base64 = await fileToGenerativePart(file);
        const imgUrl = `data:image/jpeg;base64,${base64}`;
        const img = new Image();
        img.onload = () => {
            const dims = { width: img.naturalWidth, height: img.naturalHeight };
            setTimeout(async () => {
                const floorName = totalFloors > 1 ? `Floor ${currentFloorIndex + 1}` : "Main Floor";
                setLoadingMessage(`Digitizing ${floorName}...`);
                try {
                    const data = await digitizeFloorPlan(base64, dims.width, dims.height);
                    const rulerStart = { x: dims.width * 0.3, y: dims.height * 0.5 };
                    const rulerEnd = { x: dims.width * 0.7, y: dims.height * 0.5 };
                    const stairRect = { x: dims.width*0.4, y: dims.height*0.4, width: dims.width*0.2, height: dims.height*0.2 };
                    const garageRuler = { start: {x: dims.width*0.4, y: dims.height*0.8}, end: {x: dims.width*0.6, y: dims.height*0.8} };

                    const newFloor: Floor = {
                        id: crypto.randomUUID(), name: floorName, imageSrc: imgUrl, imageDims: dims, data: data,
                        scaleData: { pixelsPerFoot: 1, calibrated: false }, remodelZone: null,
                        calibrationRuler: { start: rulerStart, end: rulerEnd }, garageRuler: garageRuler,
                        stairLocation: stairRect, orientation: { frontAngle: 0 }, history: [], currentVersionId: '', visuals: []
                    };
                    const initialVersionId = crypto.randomUUID();
                    newFloor.history.push({ id: initialVersionId, timestamp: Date.now(), description: "Original Import", data: JSON.parse(JSON.stringify(data)) });
                    newFloor.currentVersionId = initialVersionId;

                    setFloors(prev => [...prev, newFloor]);
                    setActiveFloorId(newFloor.id);
                    setStep(AppStep.SCALE_VERIFICATION);
                } catch (err) { console.error(err); alert("AI Processing Failed. Please try again."); } finally { setLoading(false); }
            }, 100);
        };
        img.src = imgUrl;
      } catch (error) { console.error(error); alert("Failed to process image file."); setLoading(false); }
    }
  };

  const handleUpdateActiveFloor = (updates: Partial<Floor>) => {
      setFloors(prev => prev.map(f => f.id === activeFloorId ? { ...f, ...updates } : f));
  };
  
  const handleGenerateRemodel = async () => {
    if (!activeFloor || !activeFloor.data || !activeFloor.remodelZone || !chatInput.trim()) return;

    setLoading(true);
    setLoadingMessage("Architecting new layout...");
    const userPrompt = chatInput;
    setChatHistory(prev => [...prev, { role: 'user', text: userPrompt }]);
    setChatInput("");
    try {
      const base64 = activeFloor.imageSrc.split(',')[1];
      const newData = await generateRemodelOptions(activeFloor.data, activeFloor.remodelZone, userPrompt, base64);
      const newVersionId = crypto.randomUUID();
      const newHistory: HistoryEntry = { id: newVersionId, timestamp: Date.now(), description: userPrompt, data: newData };
      handleUpdateActiveFloor({ data: newData, history: [...activeFloor.history, newHistory], currentVersionId: newVersionId });
      setChatHistory(prev => [...prev, { role: 'ai', text: "Plan updated successfully." }]);
    } catch (e) { console.error(e); setChatHistory(prev => [...prev, { role: 'ai', text: "Error generating plan." }]); alert("AI Error"); } finally { setLoading(false); }
  };

  const handleDeleteSelected = () => {
      if (!activeFloor?.data || !selectedElement.id) return;
      saveToHistory();
      const newWalls = activeFloor.data.walls.filter(w => w.id !== selectedElement.id);
      handleUpdateActiveFloor({ data: { ...activeFloor.data, walls: newWalls } });
      setSelectedElement({ type: null, id: null });
  };

  // --- Canvas Interactions ---

  const handleApplyCalibration = () => {
      if (!activeFloor) return;
      const feet = parseFloat(calFeet) || 0;
      const inches = parseFloat(calInches) || 0;
      const totalFeet = feet + (inches / 12);
      if (totalFeet <= 0) return alert("Invalid length.");
      const dist = getDistance(activeFloor.calibrationRuler.start, activeFloor.calibrationRuler.end);
      handleUpdateActiveFloor({ scaleData: { pixelsPerFoot: dist / totalFeet, calibrated: true } });
  };

  // Replaced prompt with Modal
  const handleVerifyRoomScale = () => {
      if (!activeFloor || !activeFloor.scaleData.calibrated) return;
      const dist = getDistance(activeFloor.calibrationRuler.start, activeFloor.calibrationRuler.end);
      const measuredFeet = dist / activeFloor.scaleData.pixelsPerFoot;
      
      setModalInput(measuredFeet.toFixed(2));
      setModalConfig({
          type: 'SCALE_VERIFY',
          title: 'Verify Measurement',
          message: `The ruler measures ${measuredFeet.toFixed(2)} ft. What is the actual length?`,
          data: { dist, measuredFeet },
          onConfirm: (userFeetVal) => {
              const userFeet = parseFloat(userFeetVal);
              if (userFeet > 0) {
                 const diff = Math.abs(modalConfig?.data.measuredFeet - userFeet);
                 const percent = diff / userFeet;
                 if (percent > 0.1) {
                     // Need sub-confirmation, simplified here to just do it or alert
                     if (confirm(`Difference of ${(percent*100).toFixed(1)}%. Update global scale?`)) {
                         handleUpdateActiveFloor({ scaleData: { pixelsPerFoot: modalConfig?.data.dist / userFeet, calibrated: true } });
                     }
                 } else {
                     alert("Verified! Scale is accurate.");
                 }
              }
              setModalConfig(null);
          }
      });
  };

  const handleCanvasClick = (pt: Point) => {
      if (!activeFloor?.data) return;

      if (step === AppStep.CORRECTION_DOORS) {
          const nearbyWindow = activeFloor.data.walls.find(w => w.type === 'window' && distToSegment(pt, w.start, w.end) < 20);
          
          // 1. Confirm Intent
          setModalConfig({
              type: 'CONFIRM',
              title: nearbyWindow ? "Replace Window?" : "Add Door?",
              message: nearbyWindow ? "Do you want to replace this window with a door?" : "Create a new door at this location?",
              onConfirm: () => {
                  // 2. Ask for Type
                  setModalConfig({
                      type: 'DOOR_TYPE',
                      title: "Select Door Type",
                      onConfirm: (typeStr) => {
                          saveToHistory();
                          const newDoor: Wall = {
                              id: crypto.randomUUID(),
                              start: { x: pt.x - 20, y: pt.y }, end: { x: pt.x + 20, y: pt.y },
                              type: 'door', doorType: typeStr as any, isExternal: false
                          };
                          let newWalls = [...activeFloor.data!.walls];
                          if (nearbyWindow) {
                              newWalls = newWalls.filter(w => w.id !== nearbyWindow.id);
                              newDoor.start = nearbyWindow.start;
                              newDoor.end = nearbyWindow.end;
                          }
                          newWalls.push(newDoor);
                          handleUpdateActiveFloor({ data: { ...activeFloor.data!, walls: newWalls } });
                          setModalConfig(null);
                      }
                  });
              },
              onCancel: () => setModalConfig(null)
          });
      }
      else if (step === AppStep.LABEL_REVIEW && isAddingRoom) {
          saveToHistory();
          const newRoom = { id: crypto.randomUUID(), name: "New Room", labelPosition: pt };
          const newRooms = [...activeFloor.data.rooms, newRoom];
          handleUpdateActiveFloor({ data: { ...activeFloor.data, rooms: newRooms } });
          setIsAddingRoom(false);
      }
  };
  
  const distToSegment = (p: Point, v: Point, w: Point) => {
    const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
  };

  // --- Render Components ---

  const Modal = () => {
      if (!modalConfig) return null;
      
      if (modalConfig.type === 'VISUAL_VIEW') {
          return (
              <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-8 backdrop-blur-md">
                   <div className="bg-white rounded-xl shadow-2xl p-4 w-full max-w-5xl h-[90vh] flex flex-col">
                       <div className="flex justify-between items-center mb-4 pb-4 border-b">
                           <h3 className="text-xl font-bold">{modalConfig.title}</h3>
                           <button onClick={() => setModalConfig(null)} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-6 h-6"/></button>
                       </div>
                       <div className="flex-1 overflow-hidden bg-slate-100 rounded-lg flex items-center justify-center relative">
                           <img src={modalConfig.data?.url} className="max-w-full max-h-full object-contain shadow-lg" alt="AI Generated" />
                       </div>
                       <div className="pt-4 flex justify-between items-center">
                           <p className="text-sm text-slate-500 italic max-w-2xl truncate">{modalConfig.data?.prompt}</p>
                           <a href={modalConfig.data?.url} download={`visual-${Date.now()}.png`} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-700">
                               <Download className="w-4 h-4"/> Download
                           </a>
                       </div>
                   </div>
              </div>
          )
      }

      return (
          <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm animate-in fade-in zoom-in duration-200">
                  <h3 className="text-xl font-bold mb-2">{modalConfig.title}</h3>
                  {modalConfig.message && <p className="text-slate-600 mb-6">{modalConfig.message}</p>}
                  
                  {modalConfig.type === 'DOOR_TYPE' && (
                      <div className="grid grid-cols-2 gap-3 mb-4">
                          {['Entry', 'Sliding', 'French', 'Pocket'].map(t => (
                              <button key={t} onClick={() => modalConfig.onConfirm && modalConfig.onConfirm(t.toLowerCase())} className="p-3 border rounded-lg hover:bg-blue-50 hover:border-blue-300 font-medium">
                                  {t}
                              </button>
                          ))}
                      </div>
                  )}

                  {modalConfig.type === 'SCALE_VERIFY' && (
                      <div className="mb-6">
                           <input 
                                type="number" 
                                autoFocus
                                value={modalInput} 
                                onChange={e => setModalInput(e.target.value)}
                                className="w-full text-2xl font-bold border-b-2 border-blue-500 focus:outline-none p-2 text-center"
                           />
                           <p className="text-center text-xs text-slate-400 mt-1">Feet</p>
                      </div>
                  )}

                  <div className="flex justify-end gap-3">
                      <button onClick={() => { if(modalConfig.onCancel) modalConfig.onCancel(); setModalConfig(null); }} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg font-medium">
                          Cancel
                      </button>
                      {(modalConfig.type === 'CONFIRM' || modalConfig.type === 'SCALE_VERIFY') && (
                          <button 
                            onClick={() => modalConfig.onConfirm && modalConfig.onConfirm(modalInput)} 
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-lg"
                          >
                              {modalConfig.type === 'SCALE_VERIFY' ? 'Verify' : 'Confirm'}
                          </button>
                      )}
                  </div>
              </div>
          </div>
      )
  }

  const Sidebar = () => (
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col z-10 p-6 shadow-xl overflow-y-auto">
          <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-800 mb-1">Floor Setup</h2>
              <p className="text-sm text-slate-500">
                  {totalFloors > 1 ? `Floor ${currentFloorIndex + 1} of ${totalFloors}` : "Main Floor Config"}
              </p>
          </div>

          <div className="flex-1 space-y-6">
              <div className="space-y-2 relative">
                   <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-slate-100"></div>
                   {[
                       {id: AppStep.SCALE_VERIFICATION, label: "Scale"},
                       ...(totalFloors > 1 ? [{id: AppStep.STAIR_MARKING, label: "Stairs"}] : []),
                       {id: AppStep.CORRECTION_DOORS, label: "Doors"},
                       {id: AppStep.CORRECTION_WALLS, label: "Walls"},
                       {id: AppStep.STRUCTURAL_ID, label: "Structural"},
                       {id: AppStep.EXTERIOR_CHECK, label: "Exterior"},
                       {id: AppStep.LABEL_REVIEW, label: "Labels"},
                       {id: AppStep.SCALE_VERIFICATION_ROOMS, label: "Room Verify"},
                       {id: AppStep.ORIENTATION, label: "Orientation"},
                   ].map((s, idx) => {
                       const isCurrent = step === s.id;
                       const isPast = Object.values(AppStep).indexOf(step) > Object.values(AppStep).indexOf(s.id);
                       return (
                           <div key={idx} className={`relative flex items-center gap-3 p-2 rounded-lg transition-colors ${isCurrent ? 'bg-blue-50 text-blue-800' : 'text-slate-500'}`}>
                               <div className={`w-6 h-6 rounded-full flex items-center justify-center z-10 text-xs font-bold ${isCurrent ? 'bg-blue-600 text-white' : isPast ? 'bg-green-500 text-white' : 'bg-slate-200'}`}>
                                   {isPast ? <CheckCircle className="w-3 h-3"/> : idx + 1}
                               </div>
                               <span className={`text-sm font-medium ${isCurrent ? 'font-bold' : ''}`}>{s.label}</span>
                           </div>
                       )
                   })}
              </div>

              {step === AppStep.LABEL_REVIEW && activeFloor?.data && (
                  <div className="border-t pt-4">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-bold text-sm">Room Labels</h3>
                        <button onClick={() => setIsAddingRoom(!isAddingRoom)} className={`text-xs px-2 py-1 rounded border flex items-center gap-1 ${isAddingRoom ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                            <Plus className="w-3 h-3"/> Add
                        </button>
                      </div>
                      
                      {isAddingRoom && <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded mb-2 animate-pulse border border-blue-100">Click on the canvas to place a new label.</div>}

                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {activeFloor.data.rooms.map((room) => (
                              <div key={room.id} className="flex items-center gap-2 text-sm">
                                  <input 
                                    className="border rounded px-2 py-1 w-24 text-xs" value={room.name} 
                                    onChange={(e) => {
                                        if (!activeFloor.data) return;
                                        const newRooms = activeFloor.data.rooms.map(r => r.id === room.id ? {...r, name: e.target.value} : r);
                                        handleUpdateActiveFloor({ data: {...activeFloor.data, rooms: newRooms} });
                                    }}
                                  />
                                  <span className="text-xs text-slate-500 font-mono bg-slate-100 px-1 rounded">
                                     {getEstimatedRoomDims(room.labelPosition, activeFloor.data.walls)}
                                  </span>
                                  <button onClick={() => {
                                      if(!activeFloor.data) return;
                                      saveToHistory();
                                      const newRooms = activeFloor.data.rooms.filter(r => r.id !== room.id);
                                      handleUpdateActiveFloor({ data: {...activeFloor.data, rooms: newRooms} });
                                  }} className="text-red-400 hover:text-red-600 ml-auto"><Trash2 className="w-3 h-3"/></button>
                              </div>
                          ))}
                      </div>
                  </div>
              )}

              {step === AppStep.SCALE_VERIFICATION_ROOMS && activeFloor?.data && (
                   <div className="border-t pt-4">
                       <p className="text-xs text-slate-500 mb-3">Drag the red ruler on the canvas to verify specific room dimensions.</p>
                       <button onClick={handleVerifyRoomScale} className="w-full bg-slate-100 text-slate-700 py-2 rounded text-sm font-medium hover:bg-slate-200 border border-slate-300">
                           Verify Measurement
                       </button>
                   </div>
              )}

              {step === AppStep.ORIENTATION && (
                  <div className="border-t pt-4 space-y-2">
                      <button onClick={() => setOrientMode('DOOR')} className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-sm ${orientMode === 'DOOR' ? 'bg-blue-100 text-blue-800' : 'hover:bg-slate-50'}`}><DoorOpen className="w-4 h-4"/> Select Front Door</button>
                      <button onClick={() => setOrientMode('GARAGE')} className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-sm ${orientMode === 'GARAGE' ? 'bg-purple-100 text-purple-800' : 'hover:bg-slate-50'}`}><ScanLine className="w-4 h-4"/> Measure Garage Width</button>
                      {activeFloor?.orientation?.garageWidth && <div className="text-xs text-purple-700 bg-purple-50 p-2 rounded ml-4 border border-purple-100">Width: <strong>{activeFloor.orientation.garageWidth.toFixed(1)} ft</strong></div>}
                      <button onClick={() => setOrientMode('COMPASS')} className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 text-sm ${orientMode === 'COMPASS' ? 'bg-red-100 text-red-800' : 'hover:bg-slate-50'}`}><Compass className="w-4 h-4"/> Set Front Direction</button>
                  </div>
              )}

          </div>
          
          <div className="mt-auto pt-4 border-t border-slate-100">
              {wizardHistory.length > 0 && (
                  <button onClick={handleUndo} className="w-full mb-3 bg-slate-100 hover:bg-slate-200 text-slate-600 py-2 rounded flex items-center justify-center gap-2 text-sm font-medium transition-colors"><Undo2 className="w-4 h-4"/> Undo Last Change</button>
              )}
              {selectedElement.id && (
                  <button onClick={handleDeleteSelected} className="w-full mb-3 bg-red-100 text-red-700 p-2 rounded flex items-center justify-center gap-2 text-sm hover:bg-red-200 font-medium"><Trash2 className="w-4 h-4"/> Delete Selected</button>
              )}
              <button onClick={handleNextStep} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all active:scale-95">Next Step <ArrowRight className="w-4 h-4"/></button>
          </div>
      </div>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50">
      <Modal />
      {/* Onboarding */}
      {step === AppStep.ONBOARDING && (
          <div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md text-center">
                  <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"><Layers className="w-8 h-8 text-blue-600"/></div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome to Smart Remodeler</h2>
                  <p className="text-slate-500 mb-8">Let's get your project set up. How many floors are you remodeling?</p>
                  <div className="flex items-center justify-center gap-4 mb-8">
                      <button onClick={() => setTotalFloors(Math.max(1, totalFloors - 1))} className="p-3 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600">-</button>
                      <span className="text-4xl font-bold text-slate-800 w-12">{totalFloors}</span>
                      <button onClick={() => setTotalFloors(totalFloors + 1)} className="p-3 bg-slate-100 rounded-lg hover:bg-slate-200 text-slate-600">+</button>
                  </div>
                  <button onClick={() => handleStartProject(totalFloors)} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all">Start Project</button>
              </div>
          </div>
      )}

       <header className="bg-white border-b border-slate-200 px-6 py-3 flex justify-between items-center z-20">
          <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-1.5 rounded-lg"><Layers className="w-5 h-5 text-white" /></div>
              <h1 className="font-bold text-slate-800 tracking-tight">Smart Home Remodeler</h1>
          </div>
          <div className="flex items-center gap-4">
            {activeFloor && (
                <div className="flex items-center bg-slate-100 rounded-full px-4 py-1.5 gap-2 border border-slate-200">
                    <Map className="w-4 h-4 text-blue-500"/>
                    <span className="text-sm font-semibold text-slate-700">{activeFloor.name}</span>
                    {activeFloor.isUnderground && <span className="text-xs bg-slate-200 px-2 rounded-full">Basement</span>}
                </div>
            )}
            {activeFloor && (
                <button onClick={handleExportProject} className="p-2 rounded-full hover:bg-slate-100 text-slate-600" title="Export Project JSON">
                    <Save className="w-5 h-5" />
                </button>
            )}
            <button onClick={() => setShowCfSettings(!showCfSettings)} className={`p-2 rounded-full hover:bg-slate-100 transition ${cfConfig.apiToken ? 'text-green-500' : 'text-slate-400'}`}>
                <Cloud className="w-5 h-5" />
            </button>
          </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        
        {step !== AppStep.REMODEL && step !== AppStep.UPLOAD_LOOP && step !== AppStep.ONBOARDING && (
            <Sidebar />
        )}

        <div className="flex-1 relative bg-slate-100/50 flex flex-col p-6">
          {loading && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-xl">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                <p className="text-slate-800 font-semibold text-lg animate-pulse">{loadingMessage}</p>
            </div>
          )}

          {!activeFloor || step === AppStep.UPLOAD_LOOP ? (
             <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full">
                <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center w-full shadow-sm hover:border-blue-400 transition-colors">
                    <div className="bg-blue-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"><Upload className="w-10 h-10 text-blue-600" /></div>
                    <h3 className="text-2xl font-bold text-slate-800 mb-2">Upload {totalFloors > 1 ? `Floor ${currentFloorIndex + 1}` : "Floor Plan"}</h3>
                    <p className="text-slate-500 mb-8">Supported formats: JPG, PNG (Max 10MB)</p>
                    <label className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl cursor-pointer transition shadow-lg font-bold text-lg">
                      <Plus className="w-5 h-5"/>
                      <span>Select Image</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                    </label>
                </div>
             </div>
          ) : step === AppStep.REMODEL ? (
             <div className="flex h-full gap-6">
                 <div className="flex-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden relative flex flex-col">
                     <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 bg-white/90 backdrop-blur rounded-full p-1 border shadow-sm">
                         <button onClick={handleGenerate3D} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-full"><Cuboid className="w-3 h-3"/> 3D View</button>
                         <button onClick={handleGenerateCinematic} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-full"><Video className="w-3 h-3"/> Cinematic</button>
                         {activeFloor.visuals?.length > 0 && (
                            <div className="w-px h-4 bg-slate-200 mx-1 self-center"></div>
                         )}
                         {activeFloor.visuals?.map((vis) => (
                             <button key={vis.id} onClick={() => setModalConfig({type: 'VISUAL_VIEW', title: 'Generated View', data: vis})} className="w-6 h-6 rounded-full overflow-hidden border border-slate-200 hover:border-blue-500">
                                 <img src={vis.url} className="w-full h-full object-cover"/>
                             </button>
                         ))}
                     </div>

                     <PlanCanvas 
                        imageSrc={activeFloor.imageSrc}
                        imageDims={activeFloor.imageDims}
                        data={activeFloor.data}
                        mode="REMODEL"
                        scaleData={activeFloor.scaleData}
                        onDataUpdate={() => {}}
                        onZoneUpdate={(z) => handleUpdateActiveFloor({remodelZone: z})}
                        onRulerUpdate={() => {}}
                        remodelZone={activeFloor.remodelZone}
                        calibrationRuler={activeFloor.calibrationRuler}
                     />
                 </div>
                 <div className="w-80 bg-white border border-slate-200 rounded-xl flex flex-col">
                     <div className="p-4 border-b"> <h3 className="font-bold">Remodel Copilot</h3> </div>
                     <div className="flex-1 p-4 overflow-y-auto">
                         {chatHistory.map((m,i) => (<div key={i} className={`mb-2 p-2 rounded ${m.role==='user'?'bg-blue-100 ml-4':'bg-slate-100 mr-4'}`}>{m.text}</div>))}
                     </div>
                     <div className="p-4 border-t">
                         <div className="mb-4">
                             <h4 className="text-xs font-bold text-slate-500 mb-2 uppercase">Room Visualization</h4>
                             <div className="grid grid-cols-2 gap-2">
                                 {activeFloor.data?.rooms.map(room => (
                                     <button key={room.id} onClick={() => handleVisualizeRoom(room.id, room.name)} className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 hover:bg-blue-50 hover:text-blue-600 rounded text-xs font-medium border border-slate-100 transition-colors text-left">
                                         <Eye className="w-3 h-3 shrink-0"/> {room.name}
                                     </button>
                                 ))}
                             </div>
                         </div>
                         <textarea className="w-full border rounded p-2 mb-2 text-sm" rows={3} placeholder="Describe changes..." value={chatInput} onChange={e=>setChatInput(e.target.value)} />
                         <button onClick={handleGenerateRemodel} className="w-full bg-blue-600 text-white py-2 rounded font-bold">Generate</button>
                     </div>
                 </div>
             </div>
          ) : (
            <div className="flex-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden relative flex flex-col">
                {step === AppStep.SCALE_VERIFICATION && (
                    <div className="absolute top-4 left-4 right-4 z-10 bg-white/90 backdrop-blur p-2 rounded-lg shadow border border-slate-200 flex items-center justify-between">
                         <div className="flex items-center gap-2 px-2"><Ruler className="w-5 h-5 text-red-500"/><span className="font-bold text-slate-700">Calibrate Scale</span></div>
                         <div className="flex items-center gap-2">
                            <input type="number" value={calFeet} onChange={e=>setCalFeet(e.target.value)} className="w-16 border rounded p-1 text-center font-bold"/> ft
                            <input type="number" value={calInches} onChange={e=>setCalInches(e.target.value)} className="w-16 border rounded p-1 text-center font-bold"/> in
                            <button onClick={handleApplyCalibration} className="bg-red-500 text-white px-4 py-1 rounded font-bold hover:bg-red-600">Apply</button>
                         </div>
                    </div>
                )}
                
                <PlanCanvas 
                  imageSrc={activeFloor.imageSrc}
                  imageDims={activeFloor.imageDims}
                  data={activeFloor.data}
                  mode={step}
                  scaleData={activeFloor.scaleData}
                  onDataUpdate={(d) => handleUpdateActiveFloor({ data: d })}
                  onZoneUpdate={() => {}}
                  onRulerUpdate={(r, type) => {
                      if (type === 'garage') {
                          let widthFt = 0;
                          if (activeFloor?.scaleData.calibrated) {
                              const pxDist = getDistance(r.start, r.end);
                              widthFt = pxDist / activeFloor.scaleData.pixelsPerFoot;
                          }
                          handleUpdateActiveFloor({ garageRuler: r, orientation: { ...activeFloor.orientation, garageWidth: widthFt } });
                      } else {
                          handleUpdateActiveFloor({ calibrationRuler: r });
                      }
                  }}
                  onStairUpdate={(r) => handleUpdateActiveFloor({ stairLocation: r })}
                  onOrientationUpdate={(o) => handleUpdateActiveFloor({ orientation: o })}
                  remodelZone={null}
                  calibrationRuler={activeFloor.calibrationRuler}
                  garageRuler={activeFloor.garageRuler}
                  stairRect={activeFloor.stairLocation}
                  orientation={activeFloor.orientation}
                  onSelect={(type, id) => setSelectedElement({type: type as any, id})}
                  onWallClick={(wall) => {
                      if(step === AppStep.ORIENTATION && orientMode === 'DOOR') {
                         handleUpdateActiveFloor({ orientation: { ...activeFloor.orientation, frontDoorId: wall.id } });
                      } else {
                         if(step === AppStep.STRUCTURAL_ID) {
                            saveToHistory();
                            const newWalls = activeFloor.data!.walls.map(w => w.id === wall.id ? { ...w, isLoadBearing: !w.isLoadBearing, isExternal: !w.isExternal } : w);
                            handleUpdateActiveFloor({ data: { ...activeFloor.data!, walls: newWalls } });
                         }
                         setSelectedElement({type: 'wall', id: wall.id});
                      }
                  }}
                  onCanvasClick={handleCanvasClick}
                  onWallDraw={(start, end) => {
                      saveToHistory();
                      const newWall: Wall = { id: crypto.randomUUID(), start, end, type: 'wall', isExternal: false };
                      handleUpdateActiveFloor({ data: { ...activeFloor.data!, walls: [...activeFloor.data!.walls, newWall] } });
                  }}
                  selectedId={selectedElement.id}
                />
            </div>
          )}
        </div>
      </main>

      {showCfSettings && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
               <div className="bg-white p-6 rounded-lg max-w-sm w-full">
                   <h3 className="font-bold mb-4">Cloud Settings</h3>
                   <input className="w-full border p-2 mb-2 rounded" placeholder="Account ID" value={cfConfig.accountId} onChange={e=>setCfConfig({...cfConfig, accountId: e.target.value})}/>
                   <input className="w-full border p-2 mb-4 rounded" type="password" placeholder="API Token" value={cfConfig.apiToken} onChange={e=>setCfConfig({...cfConfig, apiToken: e.target.value})}/>
                   <button onClick={()=>setShowCfSettings(false)} className="w-full bg-blue-600 text-white py-2 rounded">Save</button>
               </div>
          </div>
      )}
    </div>
  );
};

export default App;

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element");
const root = createRoot(rootElement);
root.render(<App />);