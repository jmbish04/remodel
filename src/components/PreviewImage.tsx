'use client';

import React from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface PreviewImageProps {
  src: string | null;
  label: string;
}

const PreviewImage: React.FC<PreviewImageProps> = ({ src, label }) => (
  <div className="relative group bg-gray-100 rounded-lg overflow-hidden border border-gray-200 shadow-sm aspect-video flex items-center justify-center">
    {src ? (
      <>
        <img src={src} alt={label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
      </>
    ) : (
      <div className="text-gray-400 flex flex-col items-center">
        <ImageIcon size={32} className="mb-2 opacity-50" />
        <span className="text-sm">Not generated</span>
      </div>
    )}
    <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm px-3 py-1 text-xs font-semibold text-gray-700 border-t border-gray-100">
      {label}
    </div>
  </div>
);

export default PreviewImage;
