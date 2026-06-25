export type BackgroundType = 'transparent' | 'color' | 'gradient' | 'pattern' | 'ai-generated';

export interface GradientConfig {
  from: string;
  to: string;
  direction: string;
}

export interface SuggestedPrompt {
  id: string;
  label: string;
  prompt: string;
  category: string;
}

export type ProcessingStage =
  | 'idle'
  | 'loading_model'
  | 'removing_bg'
  | 'analyzing_subject'
  | 'generating_bg'
  | 'completed'
  | 'error';

export interface ImageWorkspace {
  id: string;
  fileName: string;
  fileSize: string;
  originalUrl: string;
  transparentUrl: string | null;
  processedBlob: Blob | null;
  width: number;
  height: number;
  // Background composites
  bgType: BackgroundType;
  bgColor: string;
  bgGradient: GradientConfig;
  bgPattern: string;
  bgAiPrompt: string;
  bgAiUrl: string | null;
  // Compositing state
  compositeUrl: string | null;
  // Shadow state
  shadowEnabled?: boolean;
  shadowIntensity?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowBlur?: number;
  shadowColor?: string;
  shadowBlendMode?: "multiply" | "screen" | "normal";
  // AI Suggestions
  subjectType: string | null;
  suggestedPrompts: SuggestedPrompt[];
}
