import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Camera, Move, ZoomIn, ZoomOut } from "lucide-react";
import { Slider } from "@/components/ui/slider";

export default function AvatarUploadCropper({ onImageCropped, children }) {
  const [showCropDialog, setShowCropDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef(null);
  const canvasRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target.result);
      setShowCropDialog(true);
      setZoom(1);
      setPosition({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  };

  const handleDragStart = (clientX, clientY) => {
    setIsDragging(true);
    setDragStart({
      x: clientX - position.x,
      y: clientY - position.y
    });
  };

  const handleDragMove = (clientX, clientY) => {
    if (!isDragging) return;
    const newX = clientX - dragStart.x;
    const newY = clientY - dragStart.y;
    setPosition({ x: newX, y: newY });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  // Mouse handlers
  const handleMouseDown = (e) => handleDragStart(e.clientX, e.clientY);
  const handleMouseMove = (e) => handleDragMove(e.clientX, e.clientY);
  const handleMouseUp = handleDragEnd;

  // Touch handlers
  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e) => {
    if (e.cancelable) e.preventDefault(); // Prevent scrolling while dragging
    const touch = e.touches[0];
    handleDragMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = handleDragEnd;

  const handleCrop = async () => {
    if (!imageRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    // Set canvas to square dimensions
    const size = 400;
    canvas.width = size;
    canvas.height = size;

    // Calculate the display dimensions
    const containerSize = 300; // The preview container size
    const scale = img.naturalWidth / img.offsetWidth;

    // Calculate source rectangle
    const centerX = (containerSize / 2 - position.x) * scale;
    const centerY = (containerSize / 2 - position.y) * scale;
    const sourceSize = (containerSize / zoom) * scale;

    // Draw the cropped image
    ctx.drawImage(
      img,
      centerX - sourceSize / 2,
      centerY - sourceSize / 2,
      sourceSize,
      sourceSize,
      0,
      0,
      size,
      size
    );

    // Convert to blob
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      
      const croppedFile = new File([blob], selectedFile.name, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });

      setShowCropDialog(false);
      setImagePreview(null);
      setSelectedFile(null);
      
      if (onImageCropped) {
        await onImageCropped(croppedFile);
      }
    }, 'image/jpeg', 0.95);
  };

  return (
    <>
      <label className="cursor-pointer">
        {children}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
      </label>

      <Dialog open={showCropDialog} onOpenChange={setShowCropDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Your Profile Photo</DialogTitle>
            <DialogDescription>
              Drag to reposition and zoom to fit perfectly
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Crop Preview */}
            <div 
              className="relative w-[300px] h-[300px] mx-auto rounded-full overflow-hidden bg-gray-100 border-4 border-gray-200 cursor-move touch-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {imagePreview && (
                <img
                  ref={imageRef}
                  src={imagePreview}
                  alt="Preview"
                  className="absolute select-none pointer-events-none"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                    transformOrigin: 'center center',
                    maxWidth: 'none',
                    width: '300px',
                    height: 'auto'
                  }}
                  draggable={false}
                />
              )}
              
              {/* Center crosshair */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-full h-0.5 bg-white/30"></div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-0.5 h-full bg-white/30"></div>
              </div>
            </div>

            {/* Zoom Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <ZoomIn className="w-4 h-4" />
                  Zoom Level
                </label>
                <span className="text-sm text-gray-600">{(zoom * 100).toFixed(0)}%</span>
              </div>
              <Slider
                value={[zoom]}
                onValueChange={(value) => setZoom(value[0])}
                min={0.5}
                max={3}
                step={0.1}
                className="w-full"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-900">
                <strong>💡 Tip:</strong> Drag the image to reposition it. Use the zoom slider to adjust the size for the perfect fit.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCropDialog(false);
                setImagePreview(null);
                setSelectedFile(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCrop}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Save Photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden canvas for cropping */}
      <canvas ref={canvasRef} className="hidden" />
    </>
  );
}