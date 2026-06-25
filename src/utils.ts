import { GradientConfig, BackgroundType } from "./types";

/**
 * Composites a transparent foreground image over a custom background type on an HTML5 canvas,
 * returning a Promise that resolves to a data URL (PNG) of the final image.
 */
export function compositeImage(
  foregroundBlob: Blob,
  bgType: BackgroundType,
  bgColor: string,
  bgGradient: GradientConfig,
  bgPattern: string,
  bgAiUrl: string | null,
  width: number,
  height: number,
  shadowEnabled?: boolean,
  shadowIntensity?: number,
  shadowOffsetX?: number,
  shadowOffsetY?: number,
  shadowBlur?: number,
  shadowColor?: string,
  shadowBlendMode?: "multiply" | "screen" | "normal"
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      reject(new Error("Could not create canvas 2D context"));
      return;
    }

    // 1. Draw Background
    if (bgType === "transparent") {
      // Keep background transparent
      ctx.clearRect(0, 0, width, height);
      drawForeground();
    } else if (bgType === "color") {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
      drawForeground();
    } else if (bgType === "gradient") {
      const { from, to, direction } = bgGradient;
      let grad: CanvasGradient;

      // Map direction string to canvas coordinates
      if (direction === "to right") {
        grad = ctx.createLinearGradient(0, 0, width, 0);
      } else if (direction === "to bottom right") {
        grad = ctx.createLinearGradient(0, 0, width, height);
      } else if (direction === "to top right") {
        grad = ctx.createLinearGradient(0, height, width, 0);
      } else {
        // default: to bottom
        grad = ctx.createLinearGradient(0, 0, 0, height);
      }

      grad.addColorStop(0, from);
      grad.addColorStop(1, to);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      drawForeground();
    } else if (bgType === "pattern") {
      // Draw plain background first
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      // Draw custom patterns manually to ensure canvas scaling and crisp rendering
      ctx.save();
      if (bgPattern === "grid") {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.06)";
        ctx.lineWidth = Math.max(1, Math.round(width * 0.001));
        const gridSize = Math.round(width * 0.04);
        for (let x = 0; x < width; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y < height; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
      } else if (bgPattern === "dots") {
        ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
        const spacing = Math.round(width * 0.04);
        const radius = Math.max(1.5, width * 0.002);
        for (let x = spacing / 2; x < width; x += spacing) {
          for (let y = spacing / 2; y < height; y += spacing) {
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (bgPattern === "lines") {
        ctx.strokeStyle = "rgba(0, 0, 0, 0.04)";
        ctx.lineWidth = Math.max(2, Math.round(width * 0.003));
        const spacing = Math.round(width * 0.03);
        for (let x = -height; x < width; x += spacing) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + height, height);
          ctx.stroke();
        }
      } else if (bgPattern === "blueprint") {
        // Blueprint background
        ctx.fillStyle = "#0f172a"; // slate-900
        ctx.fillRect(0, 0, width, height);
        
        ctx.strokeStyle = "rgba(30, 41, 59, 0.5)"; // darker lines
        ctx.lineWidth = 1;
        const smallGrid = Math.round(width * 0.02);
        for (let x = 0; x < width; x += smallGrid) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y < height; y += smallGrid) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }

        ctx.strokeStyle = "rgba(56, 189, 248, 0.15)"; // sky-400 lines
        ctx.lineWidth = 1.5;
        const mainGrid = Math.round(width * 0.1);
        for (let x = 0; x < width; x += mainGrid) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }
        for (let y = 0; y < height; y += mainGrid) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
        }
      } else {
        // fallback white
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
      drawForeground();
    } else if (bgType === "ai-generated" && bgAiUrl) {
      // Load AI generated image
      const bgImg = new Image();
      bgImg.crossOrigin = "anonymous";
      bgImg.onload = () => {
        // Draw background, cover canvas aspect-ratio-wise
        const bgAspect = bgImg.width / bgImg.height;
        const canvasAspect = width / height;
        let drawWidth = width;
        let drawHeight = height;
        let offsetX = 0;
        let offsetY = 0;

        if (bgAspect > canvasAspect) {
          drawWidth = height * bgAspect;
          offsetX = (width - drawWidth) / 2;
        } else {
          drawHeight = width / bgAspect;
          offsetY = (height - drawHeight) / 2;
        }

        ctx.drawImage(bgImg, offsetX, offsetY, drawWidth, drawHeight);
        drawForeground();
      };
      bgImg.onerror = (err) => {
        reject(new Error("Failed to load AI background image for compositing"));
      };
      bgImg.src = bgAiUrl;
    } else {
      // default: white
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      drawForeground();
    }

    // 2. Draw Foreground Transparent Image
    function drawForeground() {
      const fgImg = new Image();
      fgImg.onload = () => {
        if (shadowEnabled) {
          const intensity = shadowIntensity !== undefined ? shadowIntensity : 0.5;
          const offsetX = shadowOffsetX !== undefined ? shadowOffsetX : 15;
          const offsetY = shadowOffsetY !== undefined ? shadowOffsetY : 15;
          const blur = shadowBlur !== undefined ? shadowBlur : 20;
          const color = shadowColor || "#000000";
          const blendMode = shadowBlendMode || "normal";

          // Parse shadowColor (could be hex) and apply intensity/opacity
          let r = 0, g = 0, b = 0;
          if (color.startsWith("#")) {
            const hex = color.replace("#", "");
            if (hex.length === 3) {
              r = parseInt(hex[0] + hex[0], 16);
              g = parseInt(hex[1] + hex[1], 16);
              b = parseInt(hex[2] + hex[2], 16);
            } else if (hex.length === 6) {
              r = parseInt(hex.substring(0, 2), 16);
              g = parseInt(hex.substring(2, 4), 16);
              b = parseInt(hex.substring(4, 6), 16);
            }
          }
          
          // Scale shadow parameters based on canvas size (reference size: 1000px)
          const scaleFactor = Math.max(width, height) / 1000;
          
          ctx.save();
          
          // Map shadow blend mode to canvas globalCompositeOperation
          let compositeOp: GlobalCompositeOperation = "source-over";
          if (blendMode === "multiply") {
            compositeOp = "multiply";
          } else if (blendMode === "screen") {
            compositeOp = "screen";
          }
          ctx.globalCompositeOperation = compositeOp;

          ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${intensity})`;
          ctx.shadowBlur = blur * scaleFactor;
          
          // Offset drawing by a huge amount so only the shadow is visible in the canvas viewport
          const offscreenOffset = 50000;
          ctx.shadowOffsetX = (offsetX * scaleFactor) - offscreenOffset;
          ctx.shadowOffsetY = offsetY * scaleFactor;
          
          ctx.drawImage(fgImg, offscreenOffset, 0, width, height);
          ctx.restore();
        }
        
        // Draw actual foreground subject on top (Normal/source-over)
        ctx.drawImage(fgImg, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      fgImg.onerror = () => {
        reject(new Error("Failed to load transparent foreground image for compositing"));
      };
      fgImg.src = URL.createObjectURL(foregroundBlob);
    }
  });
}

/**
 * Formats a file size in bytes to a human-readable string.
 */
export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Converts a data URL to a Blob
 */
export function dataURLtoBlob(dataurl: string): Blob {
  const arr = dataurl.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}
