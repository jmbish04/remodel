import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AppStep, Floor, RemodelZone, RulerData, HistoryEntry } from './types';
import PlanCanvas from './components/PlanCanvas';
import { digitizeFloorPlan, fileToGenerativePart, generateRemodelOptions } from './services/geminiService';
import { Loader2, Upload, Ruler, PenTool, RotateCcw, MessageSquare, Download, Layers, Plus, Map, CheckCircle, Calculator, History, Undo2, Clock, ChevronRight } from 'lucide-react';

const App: React.FC = () => {
  const [floors, setFloors] = useState<Floor[]>([]);
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const [step, setStep] = useState<AppStep>(AppStep.PROJECT_OVERVIEW);
  
  // Loading State
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  
  // Calibration Inputs
  const [calFeet, setCalFeet] = useState<string>("10");
  const [calInches, setCalInches] = useState<string>("0");

  // Right Panel Tab State
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');

  // Chat State
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'ai', text: string}[]>([]);

  // Helpers
  const activeFloor = floors.find(f => f.id === activeFloorId);

  // File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Reset the input value
      e.target.value = '';

      setLoading(true);
      setLoadingMessage("Reading image...");
      try {
        const base64 = await fileToGenerativePart(file);
        const imgUrl = `data:image/jpeg;base64,${base64}`;
        
        // Detect dimensions using an Image object
        const img = new Image();
        img.onload = () => {
            const dims = { width: img.naturalWidth, height: img.naturalHeight };
            
            setTimeout(async () => {
                const floorName = prompt("Enter a name for this floor (e.g., 'Ground Floor', 'Basement', '2nd Floor'):", "Ground Floor") || "New Floor";
                
                setLoadingMessage(`Digitizing ${floorName}...`);
                try {
                    const data = await digitizeFloorPlan(base64, dims.width, dims.height);
                    
                    // Initialize ruler in center
                    const rulerStart = { x: dims.width * 0.3, y: dims.height * 0.5 };
                    const rulerEnd = { x: dims.width * 0.7, y: dims.height * 0.5 };
                    
                    // Create initial history entry
                    const initialVersionId = crypto.randomUUID();
                    const initialHistory: HistoryEntry = {
                        id: initialVersionId,
                        timestamp: Date.now(),
                        description: "Original Import",
                        data: JSON.parse(JSON.stringify(data)) // Deep copy
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
                        history: [initialHistory],
                        currentVersionId: initialVersionId
                    };

                    setFloors(prev => [...prev, newFloor]);
                    setActiveFloorId(newFloor.id);
                    setStep(AppStep.CALIBRATION);

                } catch (err) {
                    console.error(err);
                    alert("AI Processing Failed. Please try again.");
                } finally {
                    setLoading(false);
                }
            }, 100);
        };
        img.onerror = () => {
            alert("Failed to load image dimensions.");
            setLoading(false);
        }
        img.src = imgUrl;

      } catch (error) {
        console.error(error);
        alert("Failed to process image file.");
        setLoading(false);
      }
    }
  };

  const handleUpdateActiveFloor = (updates: Partial<Floor>) => {
      setFloors(prev => prev.map(f => f.id === activeFloorId ? { ...f, ...updates } : f));
  };
  
  const handleApplyCalibration = () => {
      if (!activeFloor) return;
      const feet = parseFloat(calFeet) || 0;
      const inches = parseFloat(calInches) || 0;
      const totalFeet = feet + (inches / 12);
      
      if (totalFeet <= 0) {
          alert("Please enter a valid length greater than 0.");
          return;
      }

      const dx = activeFloor.calibrationRuler.end.x - activeFloor.calibrationRuler.start.x;
      const dy = activeFloor.calibrationRuler.end.y - activeFloor.calibrationRuler.start.y;
      const pixelDistance = Math.sqrt(dx*dx + dy*dy);
      
      const pixelsPerFoot = pixelDistance / totalFeet;
      
      handleUpdateActiveFloor({ 
          scaleData: { pixelsPerFoot, calibrated: true } 
      });
      setStep(AppStep.REMODEL);
  };

  const handleGenerateRemodel = async () => {
    if (!activeFloor?.data || !activeFloor.remodelZone || !chatInput.trim()) return;

    setLoading(true);
    setLoadingMessage("Architecting new layout...");
    const userMsg = chatInput;
    setChatInput("");
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);

    try {
      const newPlan = await generateRemodelOptions(activeFloor.data, activeFloor.remodelZone, userMsg);
      // Preserve dimensions
      if (activeFloor.data.width) newPlan.width = activeFloor.data.width;
      if (activeFloor.data.height) newPlan.height = activeFloor.data.height;
      
      // Create new history entry
      const newVersionId = crypto.randomUUID();
      const newEntry: HistoryEntry = {
          id: newVersionId,
          timestamp: Date.now(),
          description: userMsg,
          data: JSON.parse(JSON.stringify(newPlan))
      };

      const updatedHistory = [...activeFloor.history, newEntry];

      handleUpdateActiveFloor({ 
          data: newPlan,
          history: updatedHistory,
          currentVersionId: newVersionId
      });
      
      setActiveTab('history'); // Switch to history tab to show the new version
      setChatHistory(prev => [...prev, { role: 'ai', text: `I've updated the layout. You can verify the changes or undo them in the History tab.` }]);
    } catch (e) {
      console.error(e);
      setChatHistory(prev => [...prev, { role: 'ai', text: "Sorry, I encountered an error generating the remodel." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreVersion = (entryId: string) => {
      if (!activeFloor) return;
      const entry = activeFloor.history.find(h => h.id === entryId);
      if (entry) {
          handleUpdateActiveFloor({
              data: JSON.parse(JSON.stringify(entry.data)), // Restore deep copy
              currentVersionId: entryId
          });
      }
  };

  const downloadJson = () => {
      if(!activeFloor?.data) return;
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeFloor.data));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href",     dataStr);
      downloadAnchorNode.setAttribute("download", `${activeFloor.name.replace(/\s/g, '_')}_remodel.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
  }

  // --- Header ---
  const Header = () => (
    <header className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-lg z-20">
      <div className="flex items-center gap-3">
        <div className="bg-blue-600 p-2 rounded-lg">
          <Layers className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Smart Home Remodeler</h1>
          <p className="text-xs text-slate-400">Multi-Level Architectural AI</p>
        </div>
      </div>
      
      {activeFloor && (
          <div className="flex items-center bg-slate-800 rounded-full px-4 py-1 gap-2">
              <Map className="w-4 h-4 text-blue-400"/>
              <span className="text-sm font-medium">{activeFloor.name}</span>
          </div>
      )}
    </header>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50">
      <Header />

      <main className="flex-1 flex overflow-hidden">
        
        {/* Sidebar: Floor List */}
        <div className="w-64 bg-white border-r border-slate-200 flex flex-col z-10 hidden md:flex">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-semibold text-slate-700">Floors</h3>
                <label className="cursor-pointer p-1 hover:bg-slate-100 rounded text-blue-600">
                    <Plus className="w-5 h-5" />
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                </label>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {floors.length === 0 && (
                    <div className="text-center p-4 text-slate-400 text-sm italic">
                        No floors yet. Upload a plan to start.
                    </div>
                )}
                {floors.map(floor => (
                    <button
                        key={floor.id}
                        onClick={() => { setActiveFloorId(floor.id); setStep(AppStep.REMODEL); }}
                        className={`w-full text-left p-3 rounded-lg flex items-center gap-3 transition ${activeFloorId === floor.id ? 'bg-blue-50 border-blue-200 border text-blue-800' : 'hover:bg-slate-50 text-slate-600'}`}
                    >
                        <div className={`w-2 h-2 rounded-full ${floor.scaleData.calibrated ? 'bg-green-500' : 'bg-yellow-400'}`}></div>
                        <span className="font-medium truncate">{floor.name}</span>
                    </button>
                ))}
            </div>
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 p-6 relative bg-gray-200/50 flex flex-col">
            
          {/* GLOBAL LOADING INDICATOR FOR CANVAS AREA */}
          {loading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-xl">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                <p className="text-slate-700 font-medium animate-pulse">{loadingMessage}</p>
            </div>
          )}

          {!activeFloor ? (
             <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl bg-slate-100 mx-10 my-10">
                <Upload className="w-16 h-16 text-slate-400 mb-4" />
                <h3 className="text-xl font-semibold text-slate-700">Upload a Floor Plan</h3>
                <p className="text-slate-500 mb-6">Start by uploading a single floor image (JPG/PNG)</p>
                <label className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg cursor-pointer transition shadow-lg flex items-center gap-2">
                  <Plus className="w-5 h-5"/>
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                  Add New Floor
                </label>
             </div>
          ) : (
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
                            onChange={e => setCalFeet(e.target.value)} 
                            className="w-16 p-1 border rounded text-sm text-center bg-white text-slate-900 placeholder:text-slate-400" 
                            placeholder="Ft" 
                        />
                        <span className="text-xs text-slate-500">ft</span>
                        <input 
                            type="number" 
                            min="0"
                            value={calInches} 
                            onChange={e => setCalInches(e.target.value)} 
                            className="w-16 p-1 border rounded text-sm text-center bg-white text-slate-900 placeholder:text-slate-400" 
                            placeholder="In" 
                        />
                        <span className="text-xs text-slate-500">in</span>
                     </div>
                     <button 
                        onClick={handleApplyCalibration}
                        className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded font-medium transition"
                     >
                        Set Scale
                     </button>
                     <span className="text-xs text-slate-500 italic hidden sm:inline">Drag the red ruler points to a known wall.</span>
                   </div>
                 ) : (
                    <div className="flex items-center gap-2">
                         <div className="flex items-center gap-2 text-sm text-green-700 px-3 py-1 bg-green-50 border border-green-200 rounded">
                             <CheckCircle className="w-4 h-4"/> Scale Set
                         </div>
                         <div className="h-4 w-px bg-slate-300 mx-2"></div>
                         <button 
                            onClick={() => handleUpdateActiveFloor({ remodelZone: null })}
                            className="text-xs flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded text-slate-700"
                        >
                            <RotateCcw className="w-3 h-3"/> Reset Zone
                        </button>
                         <button 
                            onClick={() => handleUpdateActiveFloor({ scaleData: { ...activeFloor.scaleData, calibrated: false } })}
                            className="text-xs flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded text-slate-700"
                        >
                            <Calculator className="w-3 h-3"/> Recalibrate
                        </button>
                        <span className="text-xs text-slate-500">Drag to define Remodel Zone</span>
                    </div>
                 )}
                 <div className="flex-1"></div>
                 <button onClick={downloadJson} className="p-2 text-slate-500 hover:text-slate-800"><Download className="w-4 h-4"/></button>
              </div>

              {/* Canvas Container */}
              <div className="flex-1 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden relative">
                <PlanCanvas 
                  imageSrc={activeFloor.imageSrc}
                  imageDims={activeFloor.imageDims}
                  data={activeFloor.data}
                  mode={!activeFloor.scaleData.calibrated ? 'CALIBRATE' : 'ZONE'}
                  scaleData={activeFloor.scaleData}
                  onDataUpdate={(newData) => handleUpdateActiveFloor({ data: newData })}
                  onZoneUpdate={(zone) => handleUpdateActiveFloor({ remodelZone: zone })}
                  onRulerUpdate={(ruler) => handleUpdateActiveFloor({ calibrationRuler: ruler })}
                  remodelZone={activeFloor.remodelZone}
                  calibrationRuler={activeFloor.calibrationRuler}
                />
              </div>
            </>
          )}
        </div>

        {/* RIGHT PANEL: Controls */}
        {activeFloor && (
          <div className="w-80 bg-white border-l border-slate-200 flex flex-col z-10">
            
            {/* Tabs */}
            <div className="flex border-b border-slate-200">
               <button 
                  onClick={() => setActiveTab('chat')}
                  className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'chat' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
               >
                  <MessageSquare className="w-4 h-4" /> Co-pilot
               </button>
               <button 
                  onClick={() => setActiveTab('history')}
                  className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 ${activeTab === 'history' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-slate-500 hover:bg-slate-50'}`}
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
                            {!activeFloor.scaleData.calibrated 
                                ? "Use the red ruler to set the scale." 
                                : "Draw a zone, then tell me what to change."}
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
                        <div className="text-center p-3 bg-red-50 text-red-800 text-xs rounded border border-red-200">
                            Set scale first.
                        </div>
                    ) : !activeFloor.remodelZone ? (
                        <div className="bg-orange-50 text-orange-700 text-xs p-3 rounded border border-orange-200 text-center">
                            Draw a Remodel Zone box.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            <textarea 
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="E.g. Remove the closet..."
                                className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none h-20 bg-white text-slate-900 placeholder:text-slate-400"
                            />
                            <button 
                                onClick={handleGenerateRemodel}
                                disabled={loading || !chatInput.trim()}
                                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium transition flex items-center justify-center gap-2"
                            >
                                {loading ? <Loader2 className="animate-spin w-4 h-4"/> : <PenTool className="w-4 h-4"/>}
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
                                              <Clock className="w-3 h-3"/> {new Date(entry.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                           </span>
                                           {!isActive && (
                                               <button 
                                                 onClick={() => handleRestoreVersion(entry.id)}
                                                 className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition"
                                               >
                                                  <Undo2 className="w-3 h-3"/> Restore
                                               </button>
                                           )}
                                        </div>
                                    </div>
                                </div>
                             )
                          })}
                       </div>
                   )}
                </div>
              )}

            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element");
const root = createRoot(rootElement);
root.render(<App />);