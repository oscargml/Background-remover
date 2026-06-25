import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Download,
  Upload,
  RefreshCw,
  Palette,
  Check,
  Info,
  Copy,
  AlertCircle,
  Paintbrush,
  Image as ImageIcon,
  CheckCircle,
  HelpCircle,
  Eye,
  Sliders,
  Grid,
  RotateCcw,
} from "lucide-react";
import { removeBackground as imglyRemoveBackground } from "@imgly/background-removal";
import DropZone from "./components/DropZone";
import CompareSlider from "./components/CompareSlider";
import { SOLID_COLORS, GRADIENTS, PATTERNS } from "./presets";
import { BackgroundType, ImageWorkspace, ProcessingStage, SuggestedPrompt } from "./types";
import { compositeImage, formatBytes, dataURLtoBlob } from "./utils";

export default function App() {
  const [stage, setStage] = useState<ProcessingStage>("idle");
  const [progress, setProgress] = useState<{ step: string; pct: number }>({ step: "", pct: 0 });
  const [workspace, setWorkspace] = useState<ImageWorkspace | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [apiHealth, setApiHealth] = useState<{ status: string; hasApiKey: boolean } | null>(null);
  
  // App UI states
  const [activeTab, setActiveTab] = useState<"color" | "pattern" | "ai">("color");
  const [previewMode, setPreviewMode] = useState<"composite" | "transparent" | "compare">("composite");
  const [customAiPrompt, setCustomAiPrompt] = useState("");
  const [aiAspect, setAiAspect] = useState<"1:1" | "4:3" | "16:9">("1:1");
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  // Check API health on load
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setApiHealth(data))
      .catch((err) => console.error("API Health check failed:", err));
  }, []);

  // Show auto-dismissing toasts
  const showToast = (type: "success" | "error" | "info", message: string) => {
    setToast({ type, message });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // 1. Process Uploaded Image & Remove Background
  const handleFileSelect = async (file: File) => {
    try {
      setErrorMsg(null);
      setStage("loading_model");
      setProgress({ step: "Initializing AI model", pct: 0 });

      // Get image dimensions first
      const dimensions = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.width, h: img.height });
        img.onerror = () => reject(new Error("Failed to load image metadata"));
        img.src = URL.createObjectURL(file);
      });

      // Remove background using the highly-optimized WASM u2net model client-side
      const processedBlob = await imglyRemoveBackground(file, {
        progress: (step, current, total) => {
          const pct = Math.round((current / total) * 100);
          let friendlyStep = "AI Segmenting...";
          if (step.includes("fetch")) {
            friendlyStep = `Loading AI Assets (First time only, cached for future runs)...`;
          } else if (step.includes("onnx")) {
            friendlyStep = "Computing foreground masks (Local Inference)...";
          }
          setProgress({ step: friendlyStep, pct });
        },
        publicPath: window.location.origin + "/api/bg-assets/",
        proxyToWorker: false,
        debug: true,
      });

      setStage("removing_bg");
      const transparentUrl = URL.createObjectURL(processedBlob);

      const initialWorkspace: ImageWorkspace = {
        id: Math.random().toString(36).substring(7),
        fileName: file.name,
        fileSize: formatBytes(file.size),
        originalUrl: URL.createObjectURL(file),
        transparentUrl,
        processedBlob,
        width: dimensions.w,
        height: dimensions.h,
        bgType: "transparent",
        bgColor: "#ffffff",
        bgGradient: { from: "#f8fafc", to: "#cbd5e1", direction: "to bottom" },
        bgPattern: "grid",
        bgAiPrompt: "",
        bgAiUrl: null,
        compositeUrl: transparentUrl,
        shadowEnabled: false,
        shadowIntensity: 0.4,
        shadowOffsetX: 15,
        shadowOffsetY: 15,
        shadowBlur: 20,
        shadowColor: "#000000",
        shadowBlendMode: "normal",
        subjectType: null,
        suggestedPrompts: [],
      };

      setWorkspace(initialWorkspace);
      setStage("completed");
      setPreviewMode("composite");
      showToast("success", "Background removed successfully!");

      // 2. Trigger Subject Analysis in background to populate AI backdrop prompts
      analyzeImageSubject(file, initialWorkspace.id);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred during background removal.");
      setStage("error");
    }
  };

  // Run Gemini Subject Analysis
  const analyzeImageSubject = async (file: File, workspaceId: string) => {
    if (!apiHealth?.hasApiKey) return; // Skip if no API key configured
    setIsAnalyzing(true);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;

      const response = await fetch("/api/analyze-subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: file.type,
        }),
      });

      if (!response.ok) {
        throw new Error("Subject analysis failed");
      }

      const data = await response.json();

      setWorkspace((prev) => {
        if (!prev || prev.id !== workspaceId) return prev;
        return {
          ...prev,
          subjectType: data.subjectType,
          suggestedPrompts: data.suggestions,
        };
      });
    } catch (err) {
      console.error("Analysis background error:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 3. Composite Image (Re-run whenever background styles change)
  useEffect(() => {
    if (!workspace || !workspace.processedBlob) return;

    let isSubscribed = true;

    const runCompositing = async () => {
      try {
        const compositeUrl = await compositeImage(
          workspace.processedBlob!,
          workspace.bgType,
          workspace.bgColor,
          workspace.bgGradient,
          workspace.bgPattern,
          workspace.bgAiUrl,
          workspace.width,
          workspace.height,
          workspace.shadowEnabled,
          workspace.shadowIntensity,
          workspace.shadowOffsetX,
          workspace.shadowOffsetY,
          workspace.shadowBlur,
          workspace.shadowColor,
          workspace.shadowBlendMode
        );

        if (isSubscribed) {
          setWorkspace((prev) => {
            if (!prev) return null;
            return { ...prev, compositeUrl };
          });
        }
      } catch (err) {
        console.error("Compositing error:", err);
      }
    };

    runCompositing();

    return () => {
      isSubscribed = false;
    };
  }, [
    workspace?.bgType,
    workspace?.bgColor,
    workspace?.bgGradient,
    workspace?.bgPattern,
    workspace?.bgAiUrl,
    workspace?.processedBlob,
    workspace?.shadowEnabled,
    workspace?.shadowIntensity,
    workspace?.shadowOffsetX,
    workspace?.shadowOffsetY,
    workspace?.shadowBlur,
    workspace?.shadowColor,
    workspace?.shadowBlendMode,
  ]);

  // 4. Generate AI Background using Gemini
  const handleGenerateAiBackground = async (promptText: string) => {
    if (!workspace) return;
    if (!apiHealth?.hasApiKey) {
      showToast("error", "GEMINI_API_KEY is missing. Please configure it in the Settings secrets panel.");
      return;
    }

    setIsGeneratingBg(true);
    showToast("info", "Prompting Gemini to design custom backdrop...");

    try {
      const response = await fetch("/api/generate-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          aspectRatio: aiAspect,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Background generation failed");
      }

      const data = await response.json();

      setWorkspace((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          bgType: "ai-generated",
          bgAiUrl: data.imageUrl,
          bgAiPrompt: promptText,
        };
      });
      setPreviewMode("composite");
      showToast("success", "AI Background composite ready!");
    } catch (err: any) {
      console.error(err);
      showToast("error", err.message || "Failed to generate background.");
    } finally {
      setIsGeneratingBg(false);
    }
  };

  // Helper: Trigger File Downloads
  const triggerDownload = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("success", "Image download started!");
  };

  // Download Transparent Only
  const handleDownloadTransparent = () => {
    if (!workspace || !workspace.transparentUrl) return;
    triggerDownload(workspace.transparentUrl, `no_bg_${workspace.fileName.split(".")[0]}.png`);
  };

  // Download Transparent PNG with Shadow applied
  const handleDownloadTransparentWithShadow = async () => {
    if (!workspace || !workspace.processedUrl) return;
    try {
      showToast("info", "Generating transparent PNG with shadow...");
      const url = await compositeImage(
        workspace.processedUrl,
        "transparent",
        "#ffffff",
        { from: "#ffffff", to: "#ffffff", direction: "to bottom" },
        "grid",
        null,
        workspace.width,
        workspace.height,
        workspace.shadowEnabled,
        workspace.shadowIntensity,
        workspace.shadowOffsetX,
        workspace.shadowOffsetY,
        workspace.shadowBlur,
        workspace.shadowColor,
        workspace.shadowBlendMode
      );
      triggerDownload(url, `no_bg_shadow_${workspace.fileName.split(".")[0]}.png`);
    } catch (err) {
      console.error(err);
      showToast("error", "Failed to generate transparent PNG with shadow");
    }
  };

  // Download Final Composited Image
  const handleDownloadComposite = () => {
    if (!workspace || !workspace.compositeUrl) return;
    triggerDownload(
      workspace.compositeUrl,
      `studio_${workspace.bgType}_${workspace.fileName.split(".")[0]}.png`
    );
  };

  // Copy to Clipboard
  const handleCopyToClipboard = async () => {
    if (!workspace || !workspace.compositeUrl) return;
    try {
      const blob = dataURLtoBlob(workspace.compositeUrl);
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ]);
      showToast("success", "Image copied to clipboard!");
    } catch (err) {
      console.error(err);
      showToast("error", "Could not copy image to clipboard automatically. Please download instead.");
    }
  };

  // Reset Workspace
  const handleReset = () => {
    setWorkspace(null);
    setStage("idle");
    setErrorMsg(null);
    setCustomAiPrompt("");
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 antialiased selection:bg-blue-green selection:text-white">
      {/* Toast Notification */}
      {toast && (
        <div
          id="toast-popup"
          className={`fixed right-6 top-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-4 shadow-xl border backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${
            toast.type === "success"
              ? "bg-emerald-500/90 border-emerald-400 text-white"
              : toast.type === "error"
              ? "bg-rose-500/90 border-rose-400 text-white"
              : "bg-deep-blue/90 border-deep-blue text-white"
          }`}
        >
          {toast.type === "success" && <CheckCircle className="h-5 w-5" />}
          {toast.type === "error" && <AlertCircle className="h-5 w-5" />}
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl h-16 items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-deep-blue text-white">
              <Sparkles className="h-5 w-5 text-amber-flame animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-deep-blue">AI Studio</h1>
              <p className="text-xs font-semibold text-blue-green uppercase tracking-widest">Background Remover</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* API Status Badge */}
            {apiHealth ? (
              <div
                id="api-status-badge"
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border ${
                  apiHealth.hasApiKey
                    ? "bg-sky-light/15 border-sky-light/30 text-deep-blue font-semibold"
                    : "bg-amber-flame/10 border-amber-flame/20 text-princeton font-semibold"
                }`}
                title={apiHealth.hasApiKey ? "Gemini Studio API Enabled" : "Local-only. API Key not found."}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${apiHealth.hasApiKey ? "bg-blue-green" : "bg-princeton"}`}></span>
                <span>{apiHealth.hasApiKey ? "Gemini Studio Active" : "Local Mode"}</span>
              </div>
            ) : (
              <div className="h-6 w-24 animate-pulse rounded-full bg-slate-100"></div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {stage === "idle" && (
          <div className="mx-auto max-w-3xl py-12 text-center">
            <span className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-sky-light/15 px-3 py-1 text-xs font-semibold text-deep-blue border border-sky-light/30">
              <Sparkles className="h-3 w-3 text-princeton fill-princeton animate-pulse" /> Fully Client-Side AI Background Segmenter
            </span>
            <h2 className="mb-4 text-4xl font-extrabold tracking-tight text-deep-blue sm:text-5xl">
              Professional Backdrops, <br />
              <span className="bg-gradient-to-r from-blue-green via-princeton to-amber-flame bg-clip-text text-transparent">
                Instantly Reimagined
              </span>
            </h2>
            <p className="mx-auto mb-10 max-w-lg text-base text-slate-500 leading-relaxed">
              Remove image backgrounds client-side in seconds with high precision, then swap, design, or generate custom backdrops using Gemini.
            </p>

            <DropZone
              onFileSelect={handleFileSelect}
              isLoading={false}
            />

            {/* Quick Presets Info */}
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-xs">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-sky-light/20 text-deep-blue">
                  <Sliders className="h-4 w-4" />
                </div>
                <h4 className="mb-1 text-sm font-bold text-slate-800">Fine Edge Detection</h4>
                <p className="text-xs text-slate-500">Local WebAssembly segmentation preserves hair, fabrics, and fine textures cleanly.</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-xs">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-green/10 text-blue-green">
                  <Palette className="h-4 w-4" />
                </div>
                <h4 className="mb-1 text-sm font-bold text-slate-800">Dynamic Styling</h4>
                <p className="text-xs text-slate-500">Instantly replace background with solids, soft linear gradients, or clean patterns.</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 text-left shadow-xs">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-flame/10 text-princeton">
                  <Sparkles className="h-4 w-4" />
                </div>
                <h4 className="mb-1 text-sm font-bold text-slate-800">AI backdrop Studio</h4>
                <p className="text-xs text-slate-500">Gemini analyzes your subject and designs high-end commercial backdrops perfectly.</p>
              </div>
            </div>
          </div>
        )}

        {/* Loading / Processing State */}
        {(stage === "loading_model" || stage === "removing_bg") && (
          <div className="mx-auto max-w-xl py-16 text-center">
            <div className="relative mb-8 inline-flex">
              <div className="absolute inset-0 animate-ping rounded-full bg-sky-light/30 opacity-75"></div>
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-sky-light/15 text-deep-blue">
                <RefreshCw className="h-10 w-10 animate-spin" />
              </div>
            </div>

            <h3 className="mb-3 text-2xl font-bold text-slate-800">Processing Your Image</h3>
            <p className="mb-8 text-sm text-slate-500 max-w-md mx-auto">{progress.step}</p>

            {/* Custom Progress Bar */}
            <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-green via-princeton to-amber-flame transition-all duration-300"
                style={{ width: `${progress.pct}%` }}
              ></div>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
              <span>Initializing model...</span>
              <span>{progress.pct}% completed</span>
            </div>

            {progress.pct < 100 && (
              <p className="mt-6 text-xs text-slate-400 italic">
                First run downloads u2net (~30MB) and stores it in your browser's local cache. Future operations are nearly instant!
              </p>
            )}
          </div>
        )}

        {/* Error State */}
        {stage === "error" && (
          <div className="mx-auto max-w-md py-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <AlertCircle className="h-8 w-8" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-slate-800">Processing Failed</h3>
            <p className="mb-6 text-sm text-slate-500">{errorMsg || "An error occurred during AI processing."}</p>
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className="h-4 w-4" /> Try Again
            </button>
          </div>
        )}

        {/* Completed Workspace */}
        {stage === "completed" && workspace && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 items-start">
            
            {/* Left Column: Image Viewports */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-xs">
                
                {/* Viewport Modes Tab */}
                <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex gap-1.5 rounded-lg bg-slate-100 p-1">
                    <button
                      onClick={() => setPreviewMode("composite")}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                        previewMode === "composite"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5" /> Composite View
                    </button>
                    <button
                      onClick={() => setPreviewMode("transparent")}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                        previewMode === "transparent"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      <Paintbrush className="h-3.5 w-3.5" /> PNG Cutout
                    </button>
                    <button
                      onClick={() => setPreviewMode("compare")}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                        previewMode === "compare"
                          ? "bg-white text-slate-900 shadow-xs"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      <Sliders className="h-3.5 w-3.5" /> Compare View
                    </button>
                  </div>

                  <span className="text-xs font-mono text-slate-400">
                    {workspace.width} × {workspace.height} px
                  </span>
                </div>

                {/* Display Area based on previewMode */}
                <div className="relative flex items-center justify-center min-h-[350px] max-h-[500px] w-full overflow-hidden rounded-2xl bg-slate-50">
                  {previewMode === "compare" && (
                    <CompareSlider
                      originalUrl={workspace.originalUrl}
                      processedUrl={workspace.compositeUrl || workspace.transparentUrl!}
                      className="w-full h-full"
                    />
                  )}

                  {previewMode === "transparent" && (
                    <div className="relative flex h-full w-full items-center justify-center py-6" style={{ backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
                      <img
                        src={workspace.transparentUrl!}
                        alt="Transparent Cutout"
                        className="max-h-[460px] object-contain transition-transform duration-200"
                      />
                    </div>
                  )}

                  {previewMode === "composite" && (
                    <div className="relative flex h-full w-full items-center justify-center py-6">
                      {/* Checkered backdrop when transparent composite is selected */}
                      {workspace.bgType === "transparent" && (
                        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
                      )}
                      <img
                        src={workspace.compositeUrl || workspace.transparentUrl!}
                        alt="Composite Backdrop"
                        className="relative z-10 max-h-[460px] object-contain transition-transform duration-200 shadow-sm"
                      />
                    </div>
                  )}
                </div>

                {/* Image Details Bar */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-50 pt-4 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-600 truncate max-w-[200px]">{workspace.fileName}</span>
                    <span>•</span>
                    <span>{workspace.fileSize}</span>
                  </div>

                  <div className="flex items-center gap-2 relative">
                    <button
                      id="copy-to-clipboard-btn"
                      onClick={handleCopyToClipboard}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-100 bg-white px-3 py-1.5 font-medium text-slate-600 hover:border-slate-200 hover:bg-slate-50 transition-colors text-xs"
                      title="Copy composite image to clipboard"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </button>

                    <div className="relative inline-block text-left">
                      <button
                        id="download-options-trigger"
                        onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-princeton px-4 py-1.5 font-semibold text-white hover:bg-princeton/90 transition-colors shadow-xs text-xs"
                      >
                        <Download className="h-3.5 w-3.5" /> Export Options
                      </button>

                      {exportDropdownOpen && (
                        <>
                          <div
                            id="download-options-backdrop"
                            className="fixed inset-0 z-40"
                            onClick={() => setExportDropdownOpen(false)}
                          />
                          <div
                            id="download-options-dropdown"
                            className="absolute right-0 bottom-full mb-2 z-50 w-72 origin-bottom-right rounded-xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-black/5 flex flex-col gap-1 text-xs"
                          >
                            <div className="px-3 py-1.5 font-bold text-slate-400 uppercase tracking-wider text-[9px] border-b border-slate-50 mb-1">
                              Select Format & Style
                            </div>
                            <button
                              id="download-composite-option"
                              onClick={() => {
                                handleDownloadComposite();
                                setExportDropdownOpen(false);
                              }}
                              className="flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                            >
                              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                                <Download className="h-3.5 w-3.5 text-princeton" /> Download Composite
                              </span>
                              <span className="text-[10px] text-slate-500">Subject + active background & shadow</span>
                            </button>

                            <button
                              id="download-transparent-shadow-option"
                              onClick={() => {
                                handleDownloadTransparentWithShadow();
                                setExportDropdownOpen(false);
                              }}
                              className="flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-slate-50 transition-colors border-t border-slate-50"
                            >
                              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                                <Eye className="h-3.5 w-3.5 text-blue-green" /> Download Transparent with Shadow
                              </span>
                              <span className="text-[10px] text-slate-500">Transparent PNG with custom drop shadow</span>
                            </button>

                            <button
                              id="download-transparent-raw-option"
                              onClick={() => {
                                handleDownloadTransparent();
                                setExportDropdownOpen(false);
                              }}
                              className="flex flex-col gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-slate-50 transition-colors border-t border-slate-50"
                            >
                              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                                <ImageIcon className="h-3.5 w-3.5 text-indigo-500" /> Download PNG Cutout (Raw)
                              </span>
                              <span className="text-[10px] text-slate-500">Raw subject with fully transparent background</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* Upload another button */}
              <div className="flex items-center justify-between rounded-2xl bg-white border border-slate-150 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-light/10 text-deep-blue">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-800">Done with this subject?</h4>
                    <p className="text-xs text-slate-500">Reset workspace and upload a new image anytime.</p>
                  </div>
                </div>
                <button
                  onClick={handleReset}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-deep-blue hover:border-blue-green transition-colors flex items-center gap-1.5"
                >
                  <Upload className="h-4 w-4" /> Upload New
                </button>
              </div>

            </div>

            {/* Right Column: Controls Dashboard */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs">
                <h3 className="mb-4 text-lg font-bold text-slate-900">Configure Backdrop</h3>

                {/* Main Action Tabs */}
                <div className="mb-6 flex border-b border-slate-100">
                  <button
                    onClick={() => setActiveTab("color")}
                    className={`flex-1 pb-3 text-sm font-semibold transition-colors ${
                      activeTab === "color"
                        ? "border-b-2 border-blue-green text-blue-green"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    Color & Gradient
                  </button>
                  <button
                    onClick={() => setActiveTab("pattern")}
                    className={`flex-1 pb-3 text-sm font-semibold transition-colors ${
                      activeTab === "pattern"
                        ? "border-b-2 border-blue-green text-blue-green"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    Patterns
                  </button>
                  <button
                    onClick={() => setActiveTab("ai")}
                    className={`flex-1 pb-3 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                      activeTab === "ai"
                        ? "border-b-2 border-blue-green text-blue-green"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-princeton animate-pulse" /> AI Backdrop
                  </button>
                </div>

                {/* Tab Content: Color & Gradient */}
                {activeTab === "color" && (
                  <div className="flex flex-col gap-6">
                    {/* Transparent Option */}
                    <button
                      onClick={() => setWorkspace((prev) => prev ? { ...prev, bgType: "transparent" } : null)}
                      className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all ${
                        workspace.bgType === "transparent"
                          ? "border-blue-green bg-sky-light/10 shadow-xs"
                          : "border-slate-100 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-md border border-slate-200" style={{ backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)", backgroundSize: "6px 6px" }} />
                        <div>
                          <span className="text-sm font-bold text-slate-800">Transparent Background</span>
                          <p className="text-xs text-slate-500">Perfect for product cutouts & editing.</p>
                        </div>
                      </div>
                      {workspace.bgType === "transparent" && <Check className="h-4 w-4 text-blue-green" />}
                    </button>

                    {/* Curated Solid Colors */}
                    <div>
                      <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Curated Studio Solids</h4>
                      <div className="grid grid-cols-4 gap-3">
                        {SOLID_COLORS.map((color) => (
                          <button
                            key={color.name}
                            onClick={() => {
                              setWorkspace((prev) => {
                                if (!prev) return null;
                                return {
                                  ...prev,
                                  bgType: "color",
                                  bgColor: color.value,
                                };
                              });
                            }}
                            className={`group relative flex h-12 flex-col items-center justify-center rounded-xl border transition-all ${
                              workspace.bgType === "color" && workspace.bgColor === color.value
                                ? "border-slate-900 ring-2 ring-slate-900/10 scale-95"
                                : "border-slate-100 hover:scale-105"
                            }`}
                            style={{ backgroundColor: color.value }}
                            title={color.name}
                          >
                            {workspace.bgType === "color" && workspace.bgColor === color.value && (
                              <Check className={`h-4 w-4 ${color.textColor}`} />
                            )}
                          </button>
                        ))}
                      </div>
                      {/* Color Picker Input */}
                      <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-100 p-3 bg-slate-50/50">
                        <div className="relative flex h-8 w-8 overflow-hidden rounded-lg border border-slate-200">
                          <input
                            type="color"
                            value={workspace.bgType === "color" ? workspace.bgColor : "#ffffff"}
                            onChange={(e) => {
                              setWorkspace((prev) => {
                                if (!prev) return null;
                                return {
                                  ...prev,
                                  bgType: "color",
                                  bgColor: e.target.value,
                                };
                              });
                            }}
                            className="absolute -inset-1 h-[200%] w-[200%] cursor-pointer border-none p-0"
                          />
                        </div>
                        <div className="flex-1">
                          <span className="text-xs font-bold text-slate-700">Custom Color</span>
                          <p className="text-[10px] text-slate-400">Pick any hex value via color picker.</p>
                        </div>
                        {workspace.bgType === "color" && (
                          <span className="font-mono text-xs text-slate-500 uppercase">{workspace.bgColor}</span>
                        )}
                      </div>
                    </div>

                    {/* Linear Gradients */}
                    <div>
                      <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Studio Gradients</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {GRADIENTS.map((grad) => (
                          <button
                            key={grad.name}
                            onClick={() => {
                              setWorkspace((prev) => {
                                if (!prev) return null;
                                return {
                                  ...prev,
                                  bgType: "gradient",
                                  bgGradient: grad.config,
                                };
                              });
                            }}
                            className={`flex h-12 items-center gap-2.5 rounded-xl border px-3 text-left transition-all ${
                              workspace.bgType === "gradient" &&
                              workspace.bgGradient.from === grad.config.from &&
                              workspace.bgGradient.to === grad.config.to
                                ? "border-slate-950 ring-2 ring-slate-950/10 scale-98"
                                : "border-slate-100 hover:bg-slate-50"
                            }`}
                          >
                            <div className={`h-7 w-7 rounded-lg border border-slate-200/50 ${grad.css}`} />
                            <span className="text-xs font-semibold text-slate-700 truncate">{grad.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                  </div>
                )}

                {/* Tab Content: Patterns */}
                {activeTab === "pattern" && (
                  <div className="flex flex-col gap-4">
                    <p className="text-xs text-slate-500 leading-relaxed mb-2">
                      Repeating geometric textures add a highly professional, tactile architectural showcase backdrop.
                    </p>
                    {PATTERNS.map((pat) => (
                      <button
                        key={pat.id}
                        onClick={() => {
                          setWorkspace((prev) => {
                            if (!prev) return null;
                            return {
                              ...prev,
                              bgType: "pattern",
                              bgPattern: pat.id,
                            };
                          });
                        }}
                        className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-all ${
                          workspace.bgType === "pattern" && workspace.bgPattern === pat.id
                            ? "border-blue-green bg-sky-light/10"
                            : "border-slate-100 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-light/10 text-deep-blue">
                          <Grid className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-slate-800">{pat.name}</span>
                            {workspace.bgType === "pattern" && workspace.bgPattern === pat.id && (
                              <Check className="h-4 w-4 text-blue-green" />
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{pat.description}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Tab Content: AI Studio Backdrops */}
                {activeTab === "ai" && (
                  <div className="flex flex-col gap-5">
                    
                    {/* Gemini Status block */}
                    {!apiHealth?.hasApiKey ? (
                      <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4">
                        <div className="flex gap-3">
                          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
                          <div>
                            <h4 className="text-sm font-bold text-amber-800">Gemini Key Required</h4>
                            <p className="mt-1 text-xs text-amber-600 leading-relaxed">
                              Configure your Gemini API key in the <strong>Secrets</strong> panel (Settings &gt; Secrets) to enable AI backdrop generations and smart image-subject analysis.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Prompt Input Box */}
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Describe Backdrop</label>
                            
                            {/* Aspect Ratio choice */}
                            <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 p-0.5">
                              {(["1:1", "4:3", "16:9"] as const).map((r) => (
                                <button
                                  key={r}
                                  onClick={() => setAiAspect(r)}
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                    aiAspect === r ? "bg-white text-slate-800 shadow-xs" : "text-slate-400"
                                  }`}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="relative">
                            <textarea
                              value={customAiPrompt}
                              onChange={(e) => setCustomAiPrompt(e.target.value)}
                              placeholder="e.g. A luxury concrete product stand centered, soft natural leaves shadow overlay, warm morning light, cinematic, realistic..."
                              className="w-full rounded-2xl border border-slate-200 p-4 pr-12 text-sm text-slate-800 placeholder-slate-400 focus:border-blue-green focus:ring-1 focus:ring-blue-green focus:outline-none min-h-[90px] resize-none"
                              disabled={isGeneratingBg}
                            />
                            <button
                              onClick={() => handleGenerateAiBackground(customAiPrompt)}
                              disabled={!customAiPrompt.trim() || isGeneratingBg}
                              className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg bg-deep-blue text-white hover:bg-blue-green disabled:bg-slate-100 disabled:text-slate-400 transition-colors"
                              title="Generate Backdrop"
                            >
                              <Sparkles className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Subject Suggestions segment */}
                        <div>
                          <div className="mb-3 flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                              Subject Suggestions
                            </span>
                            {isAnalyzing && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-princeton font-semibold animate-pulse">
                                <RefreshCw className="h-3 w-3 animate-spin" /> Gemini Analyzing...
                              </span>
                            )}
                          </div>

                          {/* Identified Subject Name */}
                          {workspace.subjectType && (
                            <div className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200/60 px-3 py-1 text-xs text-slate-600">
                              <Check className="h-3.5 w-3.5 text-blue-green" />
                              <span>Detected: <strong>{workspace.subjectType}</strong></span>
                            </div>
                          )}

                          {/* Suggested prompt list */}
                          {workspace.suggestedPrompts && workspace.suggestedPrompts.length > 0 ? (
                            <div className="grid grid-cols-1 gap-3 max-h-[220px] overflow-y-auto pr-1">
                              {workspace.suggestedPrompts.map((item) => (
                                <button
                                  key={item.id}
                                  onClick={() => {
                                    setCustomAiPrompt(item.prompt);
                                    handleGenerateAiBackground(item.prompt);
                                  }}
                                  disabled={isGeneratingBg}
                                  className={`flex w-full flex-col gap-1 rounded-xl border p-3.5 text-left transition-all ${
                                    customAiPrompt === item.prompt
                                      ? "border-princeton bg-amber-flame/10"
                                      : "border-slate-100 hover:bg-slate-50"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-800">{item.label}</span>
                                    <span className="rounded bg-sky-light/25 px-1.5 py-0.5 text-[9px] font-bold text-deep-blue uppercase">
                                      {item.category}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                                    {item.prompt}
                                  </p>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-100 p-6 text-center">
                              <HelpCircle className="mx-auto h-6 w-6 text-slate-300" />
                              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                                Uploaded image will be analyzed to recommend custom photography styles automatically.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* If AI backdrop generated, show prompt info */}
                        {workspace.bgType === "ai-generated" && workspace.bgAiPrompt && (
                          <div className="rounded-2xl border border-sky-light/30 bg-sky-light/5 p-4">
                            <span className="text-[10px] font-bold uppercase text-blue-green tracking-wider">Active AI Prompt</span>
                            <p className="mt-1 text-xs text-slate-600 leading-relaxed italic">
                              "{workspace.bgAiPrompt}"
                            </p>
                          </div>
                        )}
                      </>
                    )}

                  </div>
                )}

              </div>

              {/* Drop Shadow Controls (Visible in Composite View) */}
              {previewMode === "composite" && (
                <div id="drop-shadow-controls-panel" className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 id="drop-shadow-title" className="text-lg font-bold text-slate-900">Foreground Drop Shadow</h3>
                      <p className="text-xs text-slate-500">Add depth to your composite subject</p>
                    </div>
                    {/* Toggle Switch */}
                    <label id="drop-shadow-toggle-label" className="relative inline-flex items-center cursor-pointer">
                      <input
                        id="drop-shadow-toggle"
                        type="checkbox"
                        checked={!!workspace.shadowEnabled}
                        onChange={(e) => {
                          setWorkspace((prev) => {
                            if (!prev) return null;
                            return { ...prev, shadowEnabled: e.target.checked };
                          });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-green"></div>
                    </label>
                  </div>

                  {workspace.shadowEnabled ? (
                    <div id="drop-shadow-sliders-container" className="flex flex-col gap-4 pt-2 border-t border-slate-100">
                      {/* Shadow Intensity slider */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                          <label id="intensity-slider-label" htmlFor="shadow-intensity-slider">Shadow Intensity (Opacity)</label>
                          <span className="text-slate-500">{Math.round((workspace.shadowIntensity ?? 0.4) * 100)}%</span>
                        </div>
                        <input
                          id="shadow-intensity-slider"
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={workspace.shadowIntensity ?? 0.4}
                          onChange={(e) => {
                            setWorkspace((prev) => {
                              if (!prev) return null;
                              return { ...prev, shadowIntensity: parseFloat(e.target.value) };
                            });
                          }}
                          className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-green"
                        />
                      </div>

                      {/* Horizontal Offset slider */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                          <label id="offsetx-slider-label" htmlFor="shadow-offsetx-slider">Horizontal Offset</label>
                          <span className="text-slate-500">{workspace.shadowOffsetX ?? 15}px</span>
                        </div>
                        <input
                          id="shadow-offsetx-slider"
                          type="range"
                          min="-100"
                          max="100"
                          step="1"
                          value={workspace.shadowOffsetX ?? 15}
                          onChange={(e) => {
                            setWorkspace((prev) => {
                              if (!prev) return null;
                              return { ...prev, shadowOffsetX: parseInt(e.target.value) };
                            });
                          }}
                          className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-green"
                        />
                      </div>

                      {/* Vertical Offset slider */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                          <label id="offsety-slider-label" htmlFor="shadow-offsety-slider">Vertical Offset</label>
                          <span className="text-slate-500">{workspace.shadowOffsetY ?? 15}px</span>
                        </div>
                        <input
                          id="shadow-offsety-slider"
                          type="range"
                          min="-100"
                          max="100"
                          step="1"
                          value={workspace.shadowOffsetY ?? 15}
                          onChange={(e) => {
                            setWorkspace((prev) => {
                              if (!prev) return null;
                              return { ...prev, shadowOffsetY: parseInt(e.target.value) };
                            });
                          }}
                          className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-green"
                        />
                      </div>

                      {/* Blur Radius slider */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                          <label id="blur-slider-label" htmlFor="shadow-blur-slider">Blur Radius</label>
                          <span className="text-slate-500">{workspace.shadowBlur ?? 20}px</span>
                        </div>
                        <input
                          id="shadow-blur-slider"
                          type="range"
                          min="0"
                          max="100"
                          step="1"
                          value={workspace.shadowBlur ?? 20}
                          onChange={(e) => {
                            setWorkspace((prev) => {
                              if (!prev) return null;
                              return { ...prev, shadowBlur: parseInt(e.target.value) };
                            });
                          }}
                          className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-green"
                        />
                      </div>

                      {/* Shadow Blend Mode Selector */}
                      <div className="flex flex-col gap-1.5">
                        <label id="blend-mode-dropdown-label" htmlFor="shadow-blend-mode-select" className="text-xs font-bold text-slate-700">Shadow Blend Mode</label>
                        <select
                          id="shadow-blend-mode-select"
                          value={workspace.shadowBlendMode ?? "normal"}
                          onChange={(e) => {
                            setWorkspace((prev) => {
                              if (!prev) return null;
                              return { ...prev, shadowBlendMode: e.target.value as "normal" | "multiply" | "screen" };
                            });
                          }}
                          className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl p-2.5 outline-none focus:border-blue-green transition-colors font-semibold"
                        >
                          <option value="normal">Normal</option>
                          <option value="multiply">Multiply (Recommended for realistic shadows)</option>
                          <option value="screen">Screen (Recommended for glow effects)</option>
                        </select>
                      </div>

                      {/* Shadow Color Selector */}
                      <div className="flex flex-col gap-2">
                        <label id="color-picker-label" className="text-xs font-bold text-slate-700">Shadow Ambient Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            id="shadow-color-picker"
                            type="color"
                            value={workspace.shadowColor ?? "#000000"}
                            onChange={(e) => {
                              setWorkspace((prev) => {
                                if (!prev) return null;
                                return { ...prev, shadowColor: e.target.value };
                              });
                            }}
                            className="h-8 w-8 rounded cursor-pointer border border-slate-200"
                            title="Choose Custom Color"
                          />
                          <div className="flex items-center gap-1">
                            {[
                              { id: "preset-neutral", label: "Neutral", value: "#000000" },
                              { id: "preset-cool-blue", label: "Cool Blue", value: "#1e293b" },
                              { id: "preset-warm-brown", label: "Warm Brown", value: "#451a03" },
                            ].map((preset) => (
                              <button
                                id={preset.id}
                                key={preset.value}
                                onClick={() => {
                                  setWorkspace((prev) => {
                                    if (!prev) return null;
                                    return { ...prev, shadowColor: preset.value };
                                  });
                                }}
                                className={`px-2 py-1 text-[11px] font-semibold rounded border transition-all ${
                                  workspace.shadowColor === preset.value
                                    ? "border-blue-green bg-sky-light/10 text-deep-blue"
                                    : "border-slate-150 hover:bg-slate-50 text-slate-600"
                                }`}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Reset to Default Button */}
                      <button
                        id="reset-shadow-defaults-btn"
                        onClick={() => {
                          setWorkspace((prev) => {
                            if (!prev) return null;
                            return {
                              ...prev,
                              shadowIntensity: 0.4,
                              shadowOffsetX: 15,
                              shadowOffsetY: 15,
                              shadowBlur: 20,
                              shadowColor: "#000000",
                              shadowBlendMode: "normal",
                            };
                          });
                        }}
                        className="mt-2 w-full py-2 px-4 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 hover:text-slate-900 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <RotateCcw className="h-3.5 w-3.5 text-slate-500" />
                        Reset to Default
                      </button>

                    </div>
                  ) : (
                    <div id="drop-shadow-disabled-placeholder" className="text-center py-4 bg-slate-50 rounded-2xl border border-dashed border-slate-150">
                      <p className="text-xs text-slate-400">Toggle the switch above to activate drop shadow controls.</p>
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
}
