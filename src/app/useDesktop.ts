import { useCallback, useEffect, useRef, useState } from "react";
import { cueNames, newDesktopSettings, shortcutNames, type Cue, type CueSettings, type DesktopSettings } from "./desktopSettings";
import { act, displayTime, minute, type Session } from "./timer";
import type { useTimer } from "./useTimer";

export type DesktopCommand = "start" | "move" | "save-move" | "cancel-move" | "dismiss" | "quit";
type Display = { id: string; name: string; primary: boolean };
type Position = { monitor: string; x: number; y: number };
type Report = {
  actions: ("pause" | "next" | "mini")[];
  displays: Display[];
  shortcutErrors: (string | null)[];
  moving: boolean;
  position: Position | null;
  alertActive: boolean;
  message: string;
};

type Alert = CueSettings & {
  token: string; label: string; target: DesktopSettings["target"]; monitor: string; volume: number;
};

const native = (window as Window & {
  __TAURI__?: { core: { invoke<T>(name: string, args: object): Promise<T> } };
}).__TAURI__?.core;

const phases = { focus: "Focus", short: "Short break", long: "Long break" };
const empty: Report = {
  actions: [], displays: [], shortcutErrors: [], moving: false, position: null, alertActive: false, message: "",
};

export function formatRemaining(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}

export function progressOf(session: Session, remaining: number): number {
  const goal = session.routine.goal;
  const target = session.routine.kind === "intervals" && goal.kind === "focus" && session.phase === "focus"
    ? Math.max(0, goal.amount * minute - session.focusTotal) : session.remaining;
  const effective = session.planned - session.remaining + Math.min(session.remaining, target);
  return effective ? Math.max(0, Math.min(1, 1 - remaining / effective)) : 1;
}

export function useDesktop(model: ReturnType<typeof useTimer>) {
  const timer = useRef(model);
  const settings = model.view?.desktop ?? newDesktopSettings();
  const busy = useRef(false);
  const commands = useRef<DesktopCommand[]>([]);
  const staged = useRef<Alert | null>(null);
  const seen = useRef<number | null>(null);
  const [report, setReport] = useState(empty);
  const [error, setError] = useState("");
  timer.current = model;

  const send = useCallback(async () => {
    const current = timer.current;
    if (!native || busy.current || !current.view) return;
    const { session, desktop, transition } = current.view;
    busy.current = true;
    try {
      if (seen.current === null) seen.current = current.baselineCue;
      if (transition && transition.id > seen.current) {
        seen.current = transition.id;
        const style = desktop.cues[transition.event];
        staged.current = {
          ...style, token: "event-" + transition.id, label: cueNames[transition.event], target: desktop.target,
          monitor: desktop.alertMonitor, volume: desktop.sound ? desktop.volume : 0,
        };
      }
      const pending = commands.current[0] ?? null;
      const command = pending === "start" && !session ? null : pending;
      const alert = staged.current;
      const remaining = session ? displayTime(session, current.now).remaining : 25 * minute;
      const phase = session ? phases[session.phase] +
        (session.status === "paused" ? " · Paused" : session.status === "ready" ? " · Ready" : "") : "Preview";
      const result = await native.invoke<Report>("present_desktop", {
        frame: {
          mini: desktop.mini, active: Boolean(session), status: session?.status ?? "idle", phase,
          clock: formatRemaining(remaining), rounds: session?.rounds ?? 0,
          progress: session ? progressOf(session, remaining) : 0,
          shortcuts: (Object.keys(shortcutNames) as (keyof typeof shortcutNames)[])
            .map(key => desktop.shortcuts[key]),
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          alert, command,
        },
      });
      if (command) commands.current.shift();
      if (staged.current === alert) staged.current = null;
      setError("");
      setReport(previous => JSON.stringify(previous) === JSON.stringify(result) ? previous : result);
      if (result.position) {
        const position = result.position;
        void current.update(workspace => {
          workspace.desktop.mini = { ...workspace.desktop.mini, placement: "free",
            monitor: position.monitor, freeX: position.x, freeY: position.y };
        });
      }
      if (result.actions.length > 0) {
        void current.update((workspace, now) => {
          for (const action of result.actions) {
            if (action === "mini") workspace.desktop.mini.enabled = !workspace.desktop.mini.enabled;
            if (action === "next") act(workspace, "next", now);
            if (action === "pause" && workspace.session?.status !== "ready") {
              act(workspace, workspace.session?.status === "paused" ? "resume" : "pause", now);
            }
          }
        });
      }
    } catch (problem) {
      setError("Windows desktop controls could not respond: " + String(problem));
    } finally {
      busy.current = false;
    }
  }, []);

  const loaded = model.view !== null;
  const stamp = model.view?.transition?.id;
  useEffect(() => {
    if (!native || !loaded) return;
    void send();
    const interval = window.setInterval(() => void send(), 300);
    return () => window.clearInterval(interval);
  }, [loaded, send]);
  useEffect(() => { if (loaded) void send(); }, [settings, stamp, loaded, send]);

  const command = (action: DesktopCommand) => {
    if (!native) return;
    if (action === "dismiss" && staged.current?.token.startsWith("preview-")) staged.current = null;
    commands.current.push(action);
    void send();
  };

  function preview(cue: Cue, sound = false) {
    if (!native) return;
    const desktop = timer.current.view?.desktop;
    if (!desktop) return;
    const style = desktop.cues[cue];
    staged.current = {
      ...style, token: "preview-" + crypto.randomUUID(), label: sound ? "Chime preview" : "Alert preview",
      enabled: !sound, target: desktop.target, monitor: desktop.alertMonitor,
      volume: sound ? desktop.volume : 0,
    };
    void send();
  }

  const change = (apply: (settings: DesktopSettings) => void) => model.update(workspace => apply(workspace.desktop));

  return { available: Boolean(native), settings, report, error, command, change, preview };
}
