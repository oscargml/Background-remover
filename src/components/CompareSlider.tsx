import React, { useState, useRef, useEffect, MouseEvent, TouchEvent } from "react";
import { MoveHorizontal } from "lucide-react";

interface CompareSliderProps {
  originalUrl: string;
  processedUrl: string;
  className?: string;
}

export default function CompareSlider({ originalUrl, processedUrl, className = "" }: CompareSliderProps) {
  const [sliderPosition, setSliderPosition] = useState<number>(50); // percentage (0 to 100)
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(percentage);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    handleMove(e.clientX);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isDragging) return;
    if (e.touches.length > 0) {
      handleMove(e.touches[0].clientX);
    }
  };

  useEffect(() => {
    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mouseup", handleMouseUp);
      window.addEventListener("touchend", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      id="compare-slider-container"
      ref={containerRef}
      className={`relative select-none overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 ${className}`}
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      onMouseDown={() => setIsDragging(true)}
      onTouchStart={() => setIsDragging(true)}
    >
      {/* Original Image (Full Background) */}
      <img
        id="compare-slider-original"
        src={originalUrl}
        alt="Original"
        className="pointer-events-none h-full w-full object-contain max-h-[500px]"
      />

      {/* Processed Image (Clipped Overlay) */}
      <div
        id="compare-slider-overlay-container"
        className="absolute top-0 bottom-0 left-0 right-0 pointer-events-none overflow-hidden"
        style={{ clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)` }}
      >
        <img
          id="compare-slider-processed"
          src={processedUrl}
          alt="Processed"
          className="pointer-events-none h-full w-full object-contain max-h-[500px]"
        />
      </div>

      {/* Slider Divider Bar */}
      <div
        id="compare-slider-bar"
        className="absolute top-0 bottom-0 w-1 bg-white cursor-ew-resize shadow-[0_0_10px_rgba(0,0,0,0.3)] group"
        style={{ left: `${sliderPosition}%` }}
      >
        <div
          id="compare-slider-handle"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-deep-blue text-white shadow-lg transition-transform active:scale-95 cursor-ew-resize"
        >
          <MoveHorizontal size={18} />
        </div>
      </div>

      {/* Labels */}
      <div className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-xs">
        Original
      </div>
      <div className="absolute bottom-3 right-3 rounded-md bg-blue-green/90 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-xs">
        AI Output
      </div>
    </div>
  );
}
