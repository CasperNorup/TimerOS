import type { MiniSettings } from "./desktopSettings";

export const displayModes = ["System", "Light", "Dark"] as const;
export const splashChoices = ["Bloom", "Origami", "Signal", "Off"] as const;
export const fonts = ["Segoe UI", "Arial", "Georgia", "Consolas"] as const;
export const densities = ["Compact", "Comfortable", "Spacious"] as const;
export const backgroundKinds = ["theme", "solid", "gradient", "bundled", "local"] as const;
export const bundledImages = { forest: "Forest Mist", coast: "Danish Coast" } as const;
export const paletteColors = { canvas: "Window background", surface: "Panel background", accent: "Accent color" } as const;

export type DisplayMode = typeof displayModes[number];
export type Variant = "light" | "dark";
export type SplashChoice = typeof splashChoices[number];
export type PaletteColors = Record<keyof typeof paletteColors, string>;
export type Theme = { id: string; name: string; light: PaletteColors; dark: PaletteColors };
export type LocalImage = { id: string; name: string };
export type Background = {
  kind: typeof backgroundKinds[number];
  color: string;
  end: string;
  angle: number;
  bundled: keyof typeof bundledImages;
  local: LocalImage | null;
  fit: "cover" | "contain";
  x: number;
  y: number;
};
export type Appearance = {
  mode: DisplayMode;
  theme: string;
  palettes: Theme[];
  background: Background;
  font: typeof fonts[number];
  headingFont: typeof fonts[number];
  textSize: number;
  lineHeight: number;
  density: typeof densities[number];
  splash: SplashChoice;
};

export const builtInThemes: readonly Theme[] = [
  { id: "blue", name: "TimerOS Blue",
    light: { canvas: "#f5f7fb", surface: "#ffffff", accent: "#174ba7" },
    dark: { canvas: "#151923", surface: "#1e2635", accent: "#a8ccff" } },
  { id: "forest", name: "Forest",
    light: { canvas: "#edf4ef", surface: "#fbfefa", accent: "#1e6545" },
    dark: { canvas: "#14201a", surface: "#1b2b23", accent: "#99d6af" } },
  { id: "violet", name: "Violet",
    light: { canvas: "#f4f0fa", surface: "#ffffff", accent: "#6638a4" },
    dark: { canvas: "#201829", surface: "#2d2239", accent: "#d4b5ff" } },
];

export function newAppearance(mode: DisplayMode = "System"): Appearance {
  return {
    mode, theme: "blue", palettes: [],
    background: { kind: "theme", color: "#e8eef8", end: "#bdcef1", angle: 135,
      bundled: "forest", local: null, fit: "cover", x: 50, y: 50 },
    font: "Segoe UI", headingFont: "Segoe UI", textSize: 100, lineHeight: 1.5,
    density: "Comfortable", splash: "Bloom",
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function member<T>(choices: readonly T[], value: unknown, fallback: T): T {
  return choices.find(choice => choice === value) ?? fallback;
}

export function hexColor(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

function range(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function colors(value: unknown, defaults: PaletteColors): PaletteColors {
  const { canvas, surface, accent } = record(value);
  return { canvas: hexColor(canvas) ?? defaults.canvas, surface: hexColor(surface) ?? defaults.surface,
    accent: hexColor(accent) ?? defaults.accent };
}

export function readAppearance(value: unknown, legacyMode: DisplayMode = "System"): Appearance {
  const saved = record(value);
  const defaults = newAppearance(legacyMode);
  const blue = builtInThemes[0];
  const ids = new Set(builtInThemes.map(theme => theme.id));
  const palettes: Theme[] = [];
  if (Array.isArray(saved.palettes)) {
    for (const value of saved.palettes) {
      const { id, name, light, dark } = record(value);
      if (typeof id !== "string" || !/^custom-[0-9a-f-]{36}$/.test(id) || ids.has(id) ||
          typeof name !== "string" || !name.trim() || name.length > 60) continue;
      ids.add(id);
      palettes.push({ id, name, light: colors(light, blue.light), dark: colors(dark, blue.dark) });
    }
  }
  const bg = record(saved.background);
  const local = record(bg.local);
  const image = typeof local.id === "string" && /^[0-9a-f-]{36}$/.test(local.id) &&
    typeof local.name === "string" && local.name.length <= 240 ? { id: local.id, name: local.name } : null;
  return {
    mode: member(displayModes, saved.mode, defaults.mode),
    theme: typeof saved.theme === "string" && ids.has(saved.theme) ? saved.theme : defaults.theme,
    palettes,
    background: {
      kind: member(backgroundKinds, bg.kind, "theme"),
      color: hexColor(bg.color) ?? defaults.background.color,
      end: hexColor(bg.end) ?? defaults.background.end,
      angle: range(bg.angle, 0, 360, defaults.background.angle),
      bundled: member(["forest", "coast"], bg.bundled, "forest"),
      local: image, fit: bg.fit === "contain" ? "contain" : "cover",
      x: range(bg.x, 0, 100, 50), y: range(bg.y, 0, 100, 50),
    },
    font: member(fonts, saved.font, defaults.font),
    headingFont: member(fonts, saved.headingFont, defaults.headingFont),
    textSize: range(saved.textSize, 90, 130, 100),
    lineHeight: member([1.3, 1.5, 1.7], saved.lineHeight, 1.5),
    density: member(densities, saved.density, defaults.density),
    splash: member(splashChoices, saved.splash, defaults.splash),
  };
}

export function activeTheme(appearance: Appearance): Theme {
  return [...builtInThemes, ...appearance.palettes].find(theme => theme.id === appearance.theme) ?? builtInThemes[0];
}

function channels(color: string): number[] {
  return [1, 3, 5].map(start => parseInt(color.slice(start, start + 2), 16));
}

function mix(a: string, b: string, amount: number): string {
  const end = channels(b);
  return "#" + channels(a).map((value, i) =>
    Math.round(value + (end[i] - value) * amount).toString(16).padStart(2, "0")).join("");
}

function luminance(color: string) {
  const [r, g, b] = channels(color).map(value => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function inkFor(background: string) {
  return ["#202638", "#eef3fb", "#000000", "#ffffff"].find(ink => contrast(ink, background) >= 4.5)!;
}

function readable(color: string, background: string) {
  const ink = inkFor(background);
  for (let amount = 0; amount <= 10; amount++) {
    const candidate = mix(color, ink, amount / 10);
    if (contrast(candidate, background) >= 4.5) return candidate;
  }
  return ink;
}

export function themeColors(palette: PaletteColors) {
  const { canvas, surface, accent } = palette;
  const text = inkFor(surface);
  const canvasText = inkFor(canvas);
  const primaryText = inkFor(accent);
  const selected = mix(surface, accent, 0.12);
  const hover = mix(canvas, canvasText, 0.08);
  return {
    canvas, canvasText, surface, text, accent: readable(accent, surface),
    track: mix(surface, text, 0.16), border: mix(surface, text, 0.18),
    muted: readable(mix(text, surface, 0.26), surface),
    hover, hoverText: inkFor(hover), selected, selectedText: readable(accent, selected),
    primary: accent, primaryText,
    primaryHover: mix(accent, luminance(primaryText) > luminance(accent) ? "#000000" : "#ffffff", 0.13),
  };
}

export function miniColors(mini: MiniSettings, palette: PaletteColors) {
  if (!mini.inheritTheme) return { color: mini.color, text: mini.text, accent: mini.accent };
  const { surface, text, accent } = themeColors(palette);
  return { color: surface, text, accent };
}

const families: Record<Appearance["font"], string> = {
  "Segoe UI": '"Segoe UI", system-ui, sans-serif',
  "Arial": "Arial, sans-serif",
  "Georgia": "Georgia, serif",
  "Consolas": "Consolas, monospace",
};

export function paletteTokens(palette: PaletteColors) {
  const theme = themeColors(palette);
  return {
    "--canvas": theme.canvas, "--canvas-ink": theme.canvasText, "--surface": theme.surface,
    "--ink": theme.text, "--muted": theme.muted, "--border": theme.border, "--track": theme.track,
    "--hover": theme.hover, "--hover-ink": theme.hoverText,
    "--selected": theme.selected, "--selected-ink": theme.selectedText,
    "--accent": theme.accent, "--focus": theme.accent, "--primary": theme.primary,
    "--primary-ink": theme.primaryText, "--primary-hover": theme.primaryHover,
  };
}

export function typographyTokens(appearance: Appearance) {
  const density = { Compact: 0.82, Comfortable: 1, Spacious: 1.22 };
  return {
    "--body-font": families[appearance.font], "--heading-font": families[appearance.headingFont],
    "--text-size": appearance.textSize + "%", "--line-height": String(appearance.lineHeight),
    "--density": String(density[appearance.density]),
  };
}
