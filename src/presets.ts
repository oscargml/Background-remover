import { GradientConfig } from "./types";

export interface ColorPreset {
  name: string;
  value: string;
  textColor: string;
}

export interface GradientPreset {
  name: string;
  config: GradientConfig;
  css: string;
}

export interface PatternPreset {
  id: string;
  name: string;
  description: string;
}

export const SOLID_COLORS: ColorPreset[] = [
  { name: "Deep Space Blue", value: "#023047", textColor: "text-white" },
  { name: "Princeton Orange", value: "#fb8500", textColor: "text-white" },
  { name: "Amber Flame", value: "#ffb703", textColor: "text-slate-900" },
  { name: "Blue-Green", value: "#219ebc", textColor: "text-white" },
  { name: "Sky Blue Light", value: "#8ecae6", textColor: "text-slate-900" },
  { name: "Pure White", value: "#ffffff", textColor: "text-slate-800" },
  { name: "Studio Gray", value: "#f1f5f9", textColor: "text-slate-800" },
  { name: "Slate Charcoal", value: "#334155", textColor: "text-white" },
  { name: "Midnight Black", value: "#0f172a", textColor: "text-white" },
  { name: "Warm Linen", value: "#fafaf9", textColor: "text-slate-800" },
  { name: "Desert Sand", value: "#f5ebe0", textColor: "text-slate-800" },
  { name: "Sage Garden", value: "#81b29a", textColor: "text-white" },
];

export const GRADIENTS: GradientPreset[] = [
  {
    name: "Princeton Sunset",
    config: { from: "#fb8500", to: "#ffb703", direction: "to bottom right" },
    css: "bg-gradient-to-br from-[#fb8500] to-[#ffb703]",
  },
  {
    name: "Deep Ocean Horizon",
    config: { from: "#023047", to: "#219ebc", direction: "to bottom" },
    css: "bg-gradient-to-b from-[#023047] to-[#219ebc]",
  },
  {
    name: "Sky Breeze",
    config: { from: "#8ecae6", to: "#219ebc", direction: "to bottom right" },
    css: "bg-gradient-to-br from-[#8ecae6] to-[#219ebc]",
  },
  {
    name: "Space Amber Flare",
    config: { from: "#023047", to: "#fb8500", direction: "to bottom right" },
    css: "bg-gradient-to-br from-[#023047] to-[#fb8500]",
  },
  {
    name: "Classic Studio",
    config: { from: "#f8fafc", to: "#cbd5e1", direction: "to bottom" },
    css: "bg-gradient-to-b from-slate-50 to-slate-300",
  },
  {
    name: "Midnight Royal",
    config: { from: "#1e3a8a", to: "#0f172a", direction: "to bottom" },
    css: "bg-gradient-to-b from-blue-900 to-slate-900",
  },
  {
    name: "Warm Sunset",
    config: { from: "#ffedd5", to: "#fecdd3", direction: "to bottom right" },
    css: "bg-gradient-to-br from-orange-100 to-rose-200",
  },
  {
    name: "Mint Refresh",
    config: { from: "#ecfdf5", to: "#a7f3d0", direction: "to bottom right" },
    css: "bg-gradient-to-br from-emerald-50 to-emerald-200",
  },
  {
    name: "Deep Cosmic",
    config: { from: "#3b0764", to: "#03001e", direction: "to bottom" },
    css: "bg-gradient-to-b from-purple-950 to-indigo-950",
  },
  {
    name: "Lavender Breeze",
    config: { from: "#f3e8ff", to: "#e9d5ff", direction: "to bottom right" },
    css: "bg-gradient-to-br from-purple-100 to-purple-200",
  },
  {
    name: "Oceanic Depth",
    config: { from: "#0ea5e9", to: "#2563eb", direction: "to top right" },
    css: "bg-gradient-to-tr from-sky-500 to-blue-600",
  },
  {
    name: "Golden Hour",
    config: { from: "#fef3c7", to: "#fde047", direction: "to bottom right" },
    css: "bg-gradient-to-br from-amber-100 to-yellow-300",
  },
];

export const PATTERNS: PatternPreset[] = [
  {
    id: "grid",
    name: "Technical Grid",
    description: "Fine light gray grid pattern ideal for technical, architectural, or gadget showcases.",
  },
  {
    id: "dots",
    name: "Halftone Dots",
    description: "Minimal dot matrix background adding professional texture and rhythm.",
  },
  {
    id: "lines",
    name: "Diagonal Lines",
    description: "Dynamic diagonal pinstripes creating speed, modernism, and premium athletic framing.",
  },
  {
    id: "blueprint",
    name: "CAD Blueprint",
    description: "Classic blueprint grid with architectural lines for engineering and design showcases.",
  },
];
