import { useCallback, useEffect, useRef, useState } from "react";
import { act, decodeWorkspace, newWorkspace, reconcile, recover, type Workspace } from "./timer";

type Signal = { kind: "lock" | "sleep"; active: boolean; at: number };
type Lifecycle = { signals: Signal[]; lockTracking: boolean; sleepTracking: boolean };
type Loaded = { contents: string | null; closedAt: number | null };
type TauriWindow = Window & { __TAURI__?: { core: { invoke: <T>(name: string, args?: object) => Promise<T> } } };

const native = (window as TauriWindow).__TAURI__?.core;
const previewKey = "timeros.workspace.preview";
const checkpointInterval = 10_000;

function getSaved(): Promise<Loaded> {
  return native
    ? native.invoke("load_workspace")
    : Promise.resolve({ contents: localStorage.getItem(previewKey), closedAt: null });
}

async function persist(state: Workspace): Promise<void> {
  const contents = JSON.stringify(state);
  if (native) await native.invoke("save_workspace", { contents });
  else localStorage.setItem(previewKey, contents);
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useTimer() {
  const state = useRef<Workspace | null>(null);
  const away = useRef(new Set<Signal["kind"]>());
  const pendingSignals = useRef<Signal[]>([]);
  const worker = useRef<Promise<unknown>>(Promise.resolve());
  const tickQueued = useRef(false);
  const [view, setView] = useState<Workspace | null>(null);
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [baselineCue, setBaselineCue] = useState(0);
  const [restored, setRestored] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const saved = await getSaved();
      const loaded = saved.contents !== null ? decodeWorkspace(saved.contents) : newWorkspace();
      setBaselineCue(loaded.transition?.id ?? 0);
      setRestored(loaded.session !== null);
      const time = Date.now();
      if (loaded.session?.status === "running") {
        recover(loaded, time, saved.closedAt);
        loaded.checkpoint = time;
        await persist(loaded);
      }
      state.current = loaded;
      setView(loaded);
      setNow(time);
      setError("");
    } catch (problem) {
      setError(message(problem));
    } finally {
      setBusy(false);
    }
  }, []);

  const update = useCallback((mutate?: (draft: Workspace, time: number) => void): Promise<boolean> => {
    if (mutate) setBusy(true);
    const job = worker.current.then(async () => {
      try {
        const current = state.current;
        if (!current) return false;
        let next = structuredClone(current);
        const nextAway = new Set(away.current);
        let changed = false;
        if (native) {
          const { signals, lockTracking, sleepTracking } = await native.invoke<Lifecycle>("take_signals");
          pendingSignals.current.push(...signals);
          setTrackingError(!lockTracking || !sleepTracking
            ? "Windows notifications for " + (!lockTracking && !sleepTracking ? "lock and sleep" : !lockTracking ? "lock" : "sleep") + " are unavailable."
            : "");
        }
        const time = Date.now();
        for (const signal of pendingSignals.current) {
          if (signal.active && !nextAway.has(signal.kind)) {
            if (nextAway.size === 0) changed = reconcile(next, signal.at) || changed;
            nextAway.add(signal.kind);
            if (next.policies[signal.kind] === "pause" && next.session?.status === "running") {
              act(next, "pause", signal.at);
              changed = true;
            }
          } else if (!signal.active && nextAway.delete(signal.kind) && nextAway.size === 0) {
            changed = reconcile(next, signal.at) || changed;
          }
        }
        if (nextAway.size === 0) {
          changed = reconcile(next, time) || changed;
          if (next.session?.status === "running" && time - next.checkpoint >= checkpointInterval) changed = true;
        }
        // Commit any due transitions even when a simultaneous user action is invalid.
        let actionError = "";
        if (mutate) {
          const draft = structuredClone(next);
          try {
            mutate(draft, time);
            next = draft;
            changed = true;
          } catch (problem) {
            actionError = message(problem);
          }
        }
        if (changed) {
          next.checkpoint = time;
          await persist(next);
          state.current = next;
          setView(next);
        }
        pendingSignals.current = [];
        away.current = nextAway;
        if (nextAway.size === 0) setNow(time);
        if (mutate) setError(actionError);
        return !actionError;
      } catch (problem) {
        setError(message(problem));
        return false;
      } finally {
        if (mutate) setBusy(false);
      }
    });
    worker.current = job;
    return job;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loaded = view !== null;
  useEffect(() => {
    if (!loaded) return;
    const interval = window.setInterval(() => {
      if (!state.current?.session || tickQueued.current) return;
      tickQueued.current = true;
      void update().finally(() => { tickQueued.current = false; });
    }, 350);
    return () => window.clearInterval(interval);
  }, [update, loaded]);

  return { view, now, busy, error, trackingError, update, load, baselineCue, restored };
}
