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
import { ZoomIn } from "lucide-react";
import { Slider } from "@/components/ui/slider";

export default function ImageCropper({ onImageCropped, children, cropShape = "round", aspectRatio = 1 }) {
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
    // Reset input
    e.target.value = null;
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

  const handleMouseDown = (e) => handleDragStart(e.clientX, e.clientY);
  const handleMouseMove = (e) => handleDragMove(e.clientX, e.clientY);
  const handleMouseUp = handleDragEnd;

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e) => {
    if (e.cancelable) e.preventDefault();
    const touch = e.touches[0];
    handleDragMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = handleDragEnd;

  const handleCrop = async () => {
    if (!imageRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    // Output dimensions
    const outputWidth = 800;
    const outputHeight = outputWidth / aspectRatio;
    
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    // Container dimensions (preview area)
    const containerWidth = 300;
    const containerHeight = containerWidth / aspectRatio;
    
    const scale = img.naturalWidth / img.offsetWidth;

    // Calculate source rectangle
    const centerX = (containerWidth / 2 - position.x) * scale;
    const centerY = (containerHeight / 2 - position.y) * scale;
    
    // Calculate source dimensions based on zoom
    // The displayed image is scaled by zoom.
    // The source crop area is inversely proportional to zoom.
    const sourceWidth = (containerWidth / zoom) * scale;
    const sourceHeight = (containerHeight / zoom) * scale;

    ctx.drawImage(
      img,
      centerX - sourceWidth / 2,
      centerY - sourceHeight / 2,
      sourceWidth,
      sourceHeight,
      0,
      0,
      outputWidth,
      outputHeight
    );

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

  // Calculate preview container style
  const containerWidth = 300;
  const containerHeight = containerWidth / aspectRatio;

  return (
    <>
      <label className="cursor-pointer block">
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
            <DialogTitle>Adjust Image</DialogTitle>
            <DialogDescription>
              Drag to reposition and zoom to fit
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-center">
              <div 
                className={`relative overflow-hidden bg-gray-100 border-4 border-gray-200 cursor-move touch-none ${
                  cropShape === 'round' ? 'rounded-full' : 'rounded-lg'
                }`}
                style={{
                  width: `${containerWidth}px`,
                  height: `${containerHeight}px`,
                }}
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
                      // We let the image be its natural size initially, centered
                      // But to ensure it covers the area, we might need to ensure min-width/height
                      // For simplicity, we rely on the user zooming/panning
                      width: '100%', 
                      height: 'auto'
                    }}
                    draggable={false}
                  />
                )}
                
                {/* Grid overlay for better positioning */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
                  <div className="w-full h-px bg-white"></div>
                  <div className="h-full w-px bg-white absolute"></div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <ZoomIn className="w-4 h-4" />
                  Zoom
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
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <canvas ref={canvasRef} className="hidden" />
    </>
  );
}