import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Enable JSON parsing with a higher limit for base64 image transfers
app.use(express.json({ limit: '25mb' }));

// Helper to get Gemini client lazily, avoiding startup crashes if key is missing
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY is not configured. Please add your API Key in the Secrets panel (Settings > Secrets) to use AI features.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// API Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY",
  });
});

// Analyze image subject and generate background ideas
app.post("/api/analyze-subject", async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const ai = getGeminiClient();
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const imagePart = {
      inlineData: {
        mimeType: mimeType || "image/png",
        data: cleanBase64,
      },
    };

    const textPart = {
      text: "Analyze this image. Identify the primary foreground subject. Then, generate 4 highly specific, creative, and visually stunning backdrop ideas for this subject. Categorize them into: 'Studio', 'Nature', 'Lifestyle', and 'Creative/Abstract'. Each idea should have a concise label, a detailed descriptive prompt designed for image generation (focused on generating JUST the background, without duplicating the subject), and the category name."
    };

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, textPart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subjectType: {
              type: Type.STRING,
              description: "A short 2-4 word description of the identified subject (e.g., 'vintage leather boot', 'ceramic mug').",
            },
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  label: { type: Type.STRING, description: "Concise title of the background style (e.g. 'Sleek Product Pedestal', 'Misty Pine Forest')." },
                  prompt: { type: Type.STRING, description: "Highly descriptive backdrop image prompt focusing strictly on background details, textures, environment and lighting (e.g., 'A professional minimalist concrete cylindrical pedestal centered in a high-end photo studio, subtle volumetric warm side-lighting, soft out-of-focus background, clean studio backdrop, commercial advertising photography style, realistic textures')." },
                  category: { type: Type.STRING, description: "One of: 'Studio', 'Nature', 'Lifestyle', 'Creative/Abstract'." }
                },
                required: ["id", "label", "prompt", "category"]
              }
            }
          },
          required: ["subjectType", "suggestions"]
        }
      }
    });

    const textResult = response.text;
    if (!textResult) {
      throw new Error("Empty response from Gemini subject analyzer.");
    }

    const data = JSON.parse(textResult.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Subject Analysis Error:", error);
    res.status(500).json({ error: error.message || "An error occurred during subject analysis." });
  }
});

// Generate backdrop image using Gemini/Imagen
app.post("/api/generate-background", async (req, res) => {
  try {
    const { prompt, aspectRatio } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Missing background generation prompt" });
    }

    const ai = getGeminiClient();

    // Generate background using gemini-2.5-flash-image by default as per guidelines
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: `High quality background image: ${prompt}. Pure background/environment, empty space in center for a product placement, beautiful atmospheric lighting, professional photography, clean details, no text or watermark.`
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio || "1:1",
        },
      },
    });

    let base64Image = null;
    const candidates = response.candidates;
    if (candidates && candidates[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = part.inlineData.data;
          break;
        }
      }
    }

    if (!base64Image) {
      throw new Error("No image was generated by the model. Make sure you are using a valid API Key.");
    }

    res.json({ imageUrl: `data:image/png;base64,${base64Image}` });
  } catch (error: any) {
    console.error("Image Generation Error:", error);
    res.status(500).json({ error: error.message || "An error occurred during background generation." });
  }
});

// Proxy and cache route for imgly background-removal assets to prevent browser/iframe CORS and fetch errors
app.get("/api/bg-assets/*", async (req, res) => {
  try {
    const assetPath = req.params[0];
    if (!assetPath) {
      return res.status(400).send("Asset path required");
    }
    
    const targetUrl = `https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/${assetPath}`;
    console.log(`[Asset Proxy] Fetching ${assetPath} from ${targetUrl}`);
    
    const response = await fetch(targetUrl);
    if (!response.ok) {
      console.error(`[Asset Proxy] Upstream returned status ${response.status} for ${assetPath}`);
      return res.status(response.status).send(`Failed to fetch upstream asset: ${response.statusText}`);
    }

    // Set appropriate content types and CORS headers
    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
    
    // Add essential headers for WASM / WebWorker cross-origin execution in iframe contexts
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    // Convert and send the asset binary data
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (error: any) {
    console.error("[Asset Proxy] Proxy failure:", error);
    res.status(500).send("Internal server error proxying asset");
  }
});

// Initialize Vite server or serve static build
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server", err);
});
