export const cueNames = {
  "focus-ended": "Focus ended",
  "break-ended": "Break ended",
  finished: "Session finished",
} as const;

export const shortcutNames = {
  pause: "Pause / Resume", next: "Start next interval", mini: "Show / Hide mini timer",
  open: "Open TimerOS", dismiss: "Dismiss alert",
} as const;

export type Cue = keyof typeof cueNames;
export type Shortcut = keyof typeof shortcutNames;
export type Chime = "none" | "low" | "bright" | "double";
export type Placement = "left" | "center" | "right" | "free";
export type AlertStyle = "fade" | "edge" | "static";

export type MiniSettings = {
  enabled: boolean;
  monitor: string;
  placement: Placement;
  freeX: number;
  freeY: number;
  opacity: number;
  size: number;
  color: string;
  text: string;
  accent: string;
  showTime: boolean;
  showProgress: boolean;
  showPhase: boolean;
  showRounds: boolean;
  progressStyle: "bar" | "line";
};

export type CueSettings = {
  enabled: boolean;
  color: string;
  opacity: number;
  style: AlertStyle;
  fadeMs: number;
  gapMs: number;
  count: number;
  repeat: boolean;
  chime: Chime;
};

export type DesktopSettings = {
  mini: MiniSettings;
  target: "all" | "selected" | "mini";
  alertMonitor: string;
  sound: boolean;
  volume: number;
  alertOnStop: boolean;
  cues: Record<Cue, CueSettings>;
  shortcuts: Record<Shortcut, string>;
};

export function newDesktopSettings(): DesktopSettings {
  const cue = (color: string, chime: Chime): CueSettings => ({
    enabled: true, color, opacity: 22, style: "fade", fadeMs: 650, gapMs: 800,
    count: 2, repeat: false, chime,
  });
  return {
    mini: {
      enabled: true, monitor: "", placement: "right", freeX: 1, freeY: 1, opacity: 90,
      size: 100, color: "#111e35", text: "#ffffff", accent: "#73b1ff",
      showTime: true, showProgress: true, showPhase: false, showRounds: false,
      progressStyle: "bar",
    },
    target: "all", alertMonitor: "", sound: false, volume: 25, alertOnStop: false,
    cues: {
      "focus-ended": cue("#4382e1", "low"),
      "break-ended": cue("#2a9e72", "bright"),
      finished: cue("#a068de", "double"),
    },
    shortcuts: {
      pause: "Ctrl+Alt+F6", next: "Ctrl+Alt+F7", mini: "Ctrl+Alt+F8",
      open: "Ctrl+Alt+F9", dismiss: "Ctrl+Alt+F10",
    },
  };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function mergeSettings<T>(defaults: T, stored: unknown): T {
  if (isObject(defaults)) {
    if (!isObject(stored)) return defaults;
    return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, mergeSettings(value, stored[key])])) as T;
  }
  return typeof stored === typeof defaults ? stored as T : defaults;
}

export function readDesktopSettings(stored: unknown): DesktopSettings {
  const defaults = newDesktopSettings();
  const result = mergeSettings(defaults, stored);
  const { mini } = result;
  const range = (n: number, min: number, max: number, fallback: number) => Number.isFinite(n)
    ? Math.min(max, Math.max(min, n)) : fallback;
  const color = (v: string, fallback: string) => /^#[\da-f]{6}$/i.test(v) ? v : fallback;

  if (!["left", "center", "right", "free"].includes(mini.placement)) mini.placement = "right";
  if (mini.progressStyle !== "line") mini.progressStyle = "bar";
  mini.freeX = range(mini.freeX, 0, 1, 1);
  mini.freeY = range(mini.freeY, 0, 1, 1);
  mini.opacity = Math.round(range(mini.opacity, 35, 100, 90));
  mini.size = Math.round(range(mini.size, 75, 160, 100));
  mini.color = color(mini.color, defaults.mini.color);
  mini.text = color(mini.text, defaults.mini.text);
  mini.accent = color(mini.accent, defaults.mini.accent);
  if (!mini.showTime && !mini.showProgress && !mini.showPhase && !mini.showRounds) mini.showTime = true;
  if (!["all", "selected", "mini"].includes(result.target)) result.target = "all";
  result.volume = Math.round(range(result.volume, 0, 100, defaults.volume));

  for (const key of Object.keys(cueNames) as Cue[]) {
    const event = result.cues[key];
    event.color = color(event.color, defaults.cues[key].color);
    if (!["fade", "edge", "static"].includes(event.style)) event.style = "fade";
    event.opacity = Math.round(range(event.opacity, 5, 55, 22));
    event.fadeMs = Math.round(range(event.fadeMs, 250, 2500, 650));
    event.gapMs = Math.round(range(event.gapMs, 0, 5000, 800));
    event.count = Math.round(range(event.count, 1, 6, 2));
    if (!["none", "low", "bright", "double"].includes(event.chime)) event.chime = "none";
  }
  for (const key of Object.keys(shortcutNames) as Shortcut[]) {
    try { result.shortcuts[key] = normalizeShortcut(result.shortcuts[key]); }
    catch { result.shortcuts[key] = ""; }
  }
  return result;
}

export function normalizeShortcut(input: string): string {
  if (!input.trim()) return "";
  const parts = input.split("+").map(key => key.trim().toUpperCase());
  const key = parts.pop();
  const order = [["CTRL", "Ctrl"], ["ALT", "Alt"], ["SHIFT", "Shift"]];
  if (!key || !(/^([A-Z0-9]|F([1-9]|1[0-2]))$/.test(key)) ||
      !(parts.includes("CTRL") || parts.includes("ALT")) ||
      new Set(parts).size !== parts.length ||
      parts.some(part => !order.some(([modifier]) => modifier === part))) {
    throw new Error("Use Ctrl or Alt plus a letter, number, or F1–F12. Shift is optional.");
  }
  return [...order.filter(([modifier]) => parts.includes(modifier)).map(([, title]) => title), key].join("+");
}

export function pulsePeriod(fadeMs: number, gapMs: number): number {
  return Math.max(2000, 2 * fadeMs + gapMs);
}
