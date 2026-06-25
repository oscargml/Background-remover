import React, { useState, DragEvent, ChangeEvent } from "react";
import { Upload, Image as ImageIcon, Loader2 } from "lucide-react";

interface DropZoneProps {
  onFileSelect: (file: File) => void;
  isLoading: boolean;
  loadingMessage?: string;
}

export default function DropZone({ onFileSelect, isLoading, loadingMessage }: DropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith("image/")) {
        onFileSelect(file);
      }
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      id="upload-dropzone"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative flex min-h-[380px] w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed transition-all duration-300 ${
        isDragActive
          ? "border-blue-green bg-sky-light/10 scale-[1.01] shadow-lg shadow-sky-light/10"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
      } ${isLoading ? "pointer-events-none opacity-80" : "cursor-pointer"}`}
    >
      <input
        type="file"
        id="file-upload-input"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        accept="image/*"
        onChange={handleFileInput}
        disabled={isLoading}
      />

      {isLoading ? (
        <div className="flex flex-col items-center p-6 text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 animate-ping rounded-full bg-sky-light/30 opacity-75"></div>
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-sky-light/15 text-deep-blue">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-800">Initializing AI Processing</h3>
          <p className="max-w-xs text-sm text-slate-500">{loadingMessage || "Please wait..."}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center p-8 text-center group">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-colors group-hover:bg-sky-light/20 group-hover:text-deep-blue">
            <Upload className="h-7 w-7 text-slate-400 group-hover:text-deep-blue" />
          </div>

          <h3 className="mb-2 text-xl font-semibold text-slate-800">Drag & Drop your image</h3>
          <p className="mb-6 text-sm text-slate-500">
            Supports JPG, PNG, WEBP up to 10MB
          </p>

          <span className="rounded-xl bg-deep-blue px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-green transition-all">
            Browse files
          </span>

          <div className="mt-8 flex items-center gap-3 rounded-full border border-slate-100 bg-slate-50/80 px-4 py-1.5 text-xs text-slate-500">
            <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
            <span>Process is completely local & private</span>
          </div>
        </div>
      )}
    </div>
  );
}
