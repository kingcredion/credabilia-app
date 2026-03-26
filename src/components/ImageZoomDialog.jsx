import React, { useRef, useState, useEffect } from "react";
import { X, ZoomIn, ShieldCheck } from "lucide-react";

export default function ImageZoomDialog({ imageUrl, isOpen, onClose, certificateId = null }) {
  const fullscreenImageRef = useRef(null);
  const [magnifierPos, setMagnifierPos] = useState({ x: 0, y: 0, imgX: 0, imgY: 0 });
  const [showMagnifier, setShowMagnifier] = useState(false);
  const [mobileZoomed, setMobileZoomed] = useState(false);

  // Prevent body scroll when modal is open
useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
      setMobileZoomed(false);
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    }
    
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, [isOpen]);

  const handleFullscreenMouseMove = (e) => {
    if (!fullscreenImageRef.current) return;
    
    const rect = fullscreenImageRef.current.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    const imgX = ((e.clientX - rect.left) / rect.width) * fullscreenImageRef.current.naturalWidth;
    const imgY = ((e.clientY - rect.top) / rect.height) * fullscreenImageRef.current.naturalHeight;
    
    setMagnifierPos({ x, y, imgX, imgY });
  };

  const handleFullscreenMouseEnter = () => {
    setShowMagnifier(true);
  };

  const handleFullscreenMouseLeave = () => {
    setShowMagnifier(false);
  };

  const getMagnifierSettings = () => {
    return { size: 180, zoom: 2.5 };
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col"
      onClick={onClose}
      style={{ 
        touchAction: 'none',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      {/* Certificate Number - Sticky at top */}
      {certificateId && (
        <div className="w-full z-50 bg-gradient-to-br from-orange-500 to-red-500 text-white px-4 py-3 md:px-6 md:py-4 shadow-2xl border-b-4 border-white flex-shrink-0">
          <div className="flex items-center justify-center gap-2 md:gap-3">
            <ShieldCheck className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" />
            <div className="text-center">
              <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wider mb-0.5 md:mb-1">Match This Certificate ID:</p>
              <p className="font-mono text-lg md:text-2xl font-bold tracking-wide">
                {certificateId}
              </p>
            </div>
            <ShieldCheck className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" />
          </div>
        </div>
      )}

      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-50 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 transition-colors backdrop-blur-sm"
      >
        <X className="w-6 h-6" />
      </button>
      
      <div 
        className="flex-1 w-full flex items-center justify-center p-4 relative overflow-auto"
        onMouseMove={handleFullscreenMouseMove}
        onMouseEnter={handleFullscreenMouseEnter}
        onMouseLeave={handleFullscreenMouseLeave}
        onClick={(e) => e.stopPropagation()}
        style={{ 
          touchAction: 'pan-x pan-y pinch-zoom'
        }}
      >
        {imageUrl && (
          <>
            <img 
              ref={fullscreenImageRef}
              src={imageUrl}
              alt="Zoomed view"
              className={`max-w-full max-h-full object-contain select-none cursor-zoom-in md:cursor-crosshair transition-transform duration-300 ${
                mobileZoomed ? 'md:scale-100 scale-[2]' : 'scale-100'
              }`}
              draggable="false"
              style={{ 
                touchAction: 'pan-x pan-y pinch-zoom',
                userSelect: 'none',
                WebkitUserSelect: 'none'
              }}
              onClick={(e) => {
                e.stopPropagation();
                // Toggle zoom on mobile tap
                if (window.innerWidth < 768) {
                  setMobileZoomed(!mobileZoomed);
                }
              }}
            />
            
            {/* Magnifying Glass - Desktop Only */}
            {showMagnifier && fullscreenImageRef.current && (() => {
              const settings = getMagnifierSettings();
              const halfSize = settings.size / 2;
              
              return (
                <div
                  className="absolute rounded-full border-4 border-white shadow-2xl pointer-events-none z-40 hidden md:block"
                  style={{
                    width: `${settings.size}px`,
                    height: `${settings.size}px`,
                    left: `${magnifierPos.x}px`,
                    top: `${magnifierPos.y}px`,
                    transform: 'translate(-50%, -50%)',
                    backgroundImage: `url(${imageUrl})`,
                    backgroundSize: `${fullscreenImageRef.current.naturalWidth * settings.zoom}px ${fullscreenImageRef.current.naturalHeight * settings.zoom}px`,
                    backgroundPosition: `${-magnifierPos.imgX * settings.zoom + halfSize}px ${-magnifierPos.imgY * settings.zoom + halfSize}px`,
                    backgroundRepeat: 'no-repeat',
                  }}
                >
                  <div className="absolute inset-0 rounded-full ring-2 ring-blue-400"></div>
                </div>
              );
            })()}
          </>
        )}
      </div>
      
      {/* Instructions - Different for Mobile vs Desktop */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 text-white px-4 py-2 rounded-full text-xs md:text-sm backdrop-blur-sm flex items-center gap-2 max-w-[90%]">
        <ZoomIn className="w-4 h-4 flex-shrink-0" />
        <span className="hidden md:inline">Hover to magnify • ESC to close</span>
        <span className="md:hidden">Tap image to zoom {mobileZoomed ? 'out' : 'in'} • Pinch & drag</span>
      </div>
    </div>
  );
}