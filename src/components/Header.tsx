'use client';

import React from 'react';
import { Layers, Map, Eye } from 'lucide-react';

interface HeaderProps {
  activeFloorName?: string;
  showVisualizer: boolean;
  onToggleVisualizer: () => void;
}

const Header: React.FC<HeaderProps> = ({ activeFloorName, showVisualizer, onToggleVisualizer }) => (
  <header className="bg-slate-900 text-white p-4 flex justify-between items-center shadow-lg z-20">
    <div className="flex items-center gap-3">
      <div className="bg-blue-600 p-2 rounded-lg">
        <Layers className="w-5 h-5 text-white" />
      </div>
      <div>
        <h1 className="text-xl font-bold tracking-tight">Ultimate AI Architect</h1>
        <p className="text-xs text-slate-400">Digitize • Calibrate • Remodel • Visualize</p>
      </div>
    </div>

    <div className="flex items-center gap-4">
      {activeFloorName && (
        <div className="flex items-center bg-slate-800 rounded-full px-4 py-1 gap-2">
          <Map className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium">{activeFloorName}</span>
        </div>
      )}
      <button
        onClick={onToggleVisualizer}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition ${
          showVisualizer ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
        }`}
      >
        <Eye className="w-4 h-4" />
        <span className="text-sm">Visualizer</span>
      </button>
    </div>
  </header>
);

export default Header;
