import { newDesktopSettings, readDesktopSettings, type DesktopSettings } from "./desktopSettings.ts";

export const minute = 60_000;
export const maxBlockMinutes = 720;

export type Phase = "focus" | "short" | "long";
export type Status = "running" | "paused" | "ready";
export type Policy = "pause" | "continue";
export type Interruption = "lock" | "sleep" | "quit";
export type Goal = { kind: "open" } | { kind: "rounds" | "focus"; amount: number };
export type Routine = {
  name: string;
  kind: "intervals" | "countdown";
  focus: number;
  short: number;
  long: number;
  longEvery: number;
  autoBreak: boolean;
  autoFocus: boolean;
  goal: Goal;
};
export type Preset = { id: string; routine: Routine };
export type Session = {
  routine: Routine;
  phase: Phase;
  status: Status;
  started: number;
  remaining: number;
  planned: number;
  focusTotal: number;
  rounds: number;
};
export type Transition = { id: number; event: "focus-ended" | "break-ended" | "finished" };
export type Workspace = {
  version: 1;
  presets: Preset[];
  nextPreset: number;
  lastPreset: string;
  policies: Record<Interruption, Policy>;
  session: Session | null;
  result: { name: string; focusTime: number; rounds: number; reason: "finished" | "stopped" } | null;
  transition: Transition | null;
  checkpoint: number;
  desktop: DesktopSettings;
};
export type TimerAction = "pause" | "resume" | "next" | "skip" | "restart" | "add" | "stop";

const classic: Routine = {
  name: "Classic Pomodoro", kind: "intervals", focus: 25, short: 5, long: 15, longEvery: 4,
  autoBreak: true, autoFocus: true, goal: { kind: "open" },
};
export const builtIns: Preset[] = [
  { id: "classic", routine: classic },
  { id: "focus45", routine: { ...classic, name: "45/5 Focus", focus: 45, longEvery: 0 } },
  { id: "focus90", routine: { ...classic, name: "90/15 Focus", focus: 90, short: 15, longEvery: 0 } },
  { id: "countdown", routine: { ...classic, name: "Countdown", kind: "countdown" } },
];

export function newWorkspace(): Workspace {
  return {
    version: 1, presets: [], nextPreset: 1, lastPreset: "classic",
    policies: { lock: "pause", sleep: "pause", quit: "pause" },
    session: null, result: null, transition: null, checkpoint: 0, desktop: newDesktopSettings(),
  };
}

function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
}

export function validateRoutine(routine: Routine): void {
  if (!routine || typeof routine.name !== "string" || !routine.name.trim() || routine.name.length > 60) {
    throw new Error("Enter a preset name of up to 60 characters.");
  }
  if (routine.kind !== "countdown" && routine.kind !== "intervals") throw new Error("Choose a timer mode.");
  if (!integer(routine.focus, 1, maxBlockMinutes) || !integer(routine.short, 1, maxBlockMinutes)
      || !integer(routine.long, 1, maxBlockMinutes)) {
    throw new Error("Enter whole-minute intervals between 1 and 720.");
  }
  if (!integer(routine.longEvery, 0, 99)) throw new Error("Enter 0 to disable long breaks, or choose 1–99 rounds.");
  if (typeof routine.autoBreak !== "boolean" || typeof routine.autoFocus !== "boolean") {
    throw new Error("Choose how the next intervals start.");
  }
  const goal = routine.goal;
  if (!goal || (goal.kind !== "open" && goal.kind !== "rounds" && goal.kind !== "focus")) {
    throw new Error("Choose when the session ends.");
  }
  if (goal.kind !== "open" && !integer(goal.amount, 1, goal.kind === "rounds" ? 999 : 1440)) {
    throw new Error("Enter a target of 1–999 rounds or 1–1,440 focus minutes.");
  }
}

export function decodeWorkspace(json: string): Workspace {
  try {
    const state = JSON.parse(json) as Workspace;
    if (state.version !== 1 || !Array.isArray(state.presets) || !integer(state.nextPreset, 1)
        || !integer(state.checkpoint, 0) || typeof state.lastPreset !== "string"
        || !["lock", "sleep", "quit"].every(key => ["pause", "continue"].includes(state.policies[key as Interruption]))) {
      throw new Error();
    }
    const ids = new Set(builtIns.map(preset => preset.id));
    for (const preset of state.presets) {
      if (typeof preset.id !== "string" || !/^custom-\d+$/.test(preset.id) || ids.has(preset.id)
          || Number(preset.id.slice(7)) >= state.nextPreset) throw new Error();
      ids.add(preset.id);
      validateRoutine(preset.routine);
    }
    if (!ids.has(state.lastPreset)) throw new Error();
    const session = state.session;
    if (session !== null) {
      validateRoutine(session.routine);
      if (!["focus", "short", "long"].includes(session.phase) ||
          !["running", "paused", "ready"].includes(session.status) ||
          !integer(session.started, 0) || !integer(session.planned, 1, maxBlockMinutes * minute) ||
          !integer(session.remaining, 1, session.planned) || !integer(session.focusTotal, 0) ||
          !integer(session.rounds, 0)) throw new Error();
    }
    const result = state.result;
    if (result !== null && (typeof result.name !== "string" || !integer(result.focusTime, 0) ||
        !integer(result.rounds, 0) || !["finished", "stopped"].includes(result.reason))) throw new Error();
    const transition = state.transition;
    if (transition !== null && (!integer(transition.id, 1) ||
        !["focus-ended", "break-ended", "finished"].includes(transition.event))) throw new Error();
    state.desktop = readDesktopSettings(state.desktop);
    return state;
  } catch {
    throw new Error("Saved TimerOS data could not be read. The original file is still available.");
  }
}

export function savePreset(state: Workspace, routine: Routine, id?: string): Preset {
  validateRoutine(routine);
  if (id) {
    const preset = state.presets.find(item => item.id === id);
    if (!preset) throw new Error("Choose a personal preset to update.");
    preset.routine = structuredClone(routine);
    return preset;
  }
  const preset = { id: "custom-" + state.nextPreset++, routine: structuredClone(routine) };
  state.presets.push(preset);
  return preset;
}

export function deletePreset(state: Workspace, id: string): void {
  const index = state.presets.findIndex(preset => preset.id === id);
  if (index < 0) throw new Error("Choose a personal preset to delete.");
  state.presets.splice(index, 1);
  if (state.lastPreset === id) state.lastPreset = "classic";
}

export function startSession(state: Workspace, routine: Routine, presetId: string, now: number): void {
  if (state.session) throw new Error("Stop the current session before starting another.");
  validateRoutine(routine);
  if (![...builtIns, ...state.presets].some(preset => preset.id === presetId)) {
    throw new Error("Choose an available preset.");
  }
  const duration = routine.focus * minute;
  state.session = {
    routine: structuredClone(routine), phase: "focus", status: "running",
    started: now, planned: duration, remaining: duration, focusTotal: 0, rounds: 0,
  };
  state.lastPreset = presetId;
  state.result = null;
  state.checkpoint = now;
}

function goalLimit(session: Session): number {
  const { goal, kind } = session.routine;
  return kind === "intervals" && goal.kind === "focus" && session.phase === "focus"
    ? Math.max(0, goal.amount * minute - session.focusTotal)
    : Infinity;
}

export function displayTime(session: Session, now: number) {
  const elapsed = session.status === "running"
    ? Math.min(session.remaining, goalLimit(session), Math.max(0, now - session.started))
    : 0;
  return {
    remaining: Math.max(0, Math.min(session.remaining, goalLimit(session)) - elapsed),
    focusTotal: session.focusTotal + (session.phase === "focus" ? elapsed : 0),
  };
}

function record(state: Workspace, event: Transition["event"]): void {
  state.transition = { id: (state.transition?.id ?? 0) + 1, event };
}

function consume(session: Session, now: number): void {
  if (session.status !== "running") return;
  const elapsed = Math.max(0, now - session.started);
  const spent = Math.min(elapsed, session.remaining, goalLimit(session));
  session.remaining -= spent;
  if (session.phase === "focus") session.focusTotal += spent;
  session.started = now;
}

function finish(state: Workspace, session: Session, reason: "finished" | "stopped"): void {
  state.result = { name: session.routine.name, focusTime: session.focusTotal, rounds: session.rounds, reason };
  state.session = null;
  if (reason === "finished" || state.desktop.alertOnStop) record(state, "finished");
}

function advance(state: Workspace, session: Session, now: number, completed: boolean): void {
  const { routine, phase } = session;
  if (completed && phase === "focus") session.rounds++;
  if (routine.kind === "countdown" ||
      (routine.goal.kind === "rounds" && session.rounds >= routine.goal.amount) ||
      (routine.goal.kind === "focus" && session.focusTotal >= routine.goal.amount * minute)) {
    finish(state, session, "finished");
    return;
  }
  if (phase === "focus") {
    session.phase = completed && routine.longEvery > 0 && session.rounds % routine.longEvery === 0
      ? "long" : "short";
    session.status = routine.autoBreak ? "running" : "ready";
    record(state, "focus-ended");
  } else {
    session.phase = "focus";
    session.status = routine.autoFocus ? "running" : "ready";
    record(state, "break-ended");
  }
  session.planned = (session.phase === "focus" ? routine.focus : routine[session.phase]) * minute;
  session.remaining = session.planned;
  session.started = now;
}

function fastForwardOpenRounds(state: Workspace, session: Session, now: number): void {
  const routine = session.routine;
  if (routine.kind !== "intervals" || routine.goal.kind !== "open" || !routine.autoBreak || !routine.autoFocus
      || session.phase !== "focus" || session.remaining !== routine.focus * minute) return;
  const blockCount = routine.longEvery || 1;
  const cycle = ((routine.focus + routine.short) * blockCount
    + (routine.longEvery ? routine.long - routine.short : 0)) * minute;
  const cycles = Math.floor((now - session.started) / cycle);
  if (cycles <= 0) return;
  const rounds = cycles * blockCount;
  session.rounds += rounds;
  session.focusTotal += rounds * routine.focus * minute;
  session.started += cycles * cycle;
  record(state, "break-ended");
}

// Reconcile deadlines. A delayed refresh consumes elapsed time in the correct intervals.
export function reconcile(state: Workspace, now: number): boolean {
  let changed = false;
  const initial = state.transition?.id;
  const session = state.session;
  if (!session || session.status !== "running") return changed;
  while (state.session && session.status === "running") {
    fastForwardOpenRounds(state, session, now);
    const duration = Math.min(session.remaining, goalLimit(session));
    const end = session.started + duration;
    if (end > now) break;
    const completed = duration === session.remaining;
    consume(session, end);
    advance(state, session, end, completed);
    changed = true;
  }
  return changed || initial !== state.transition?.id;
}

export function act(state: Workspace, action: TimerAction, now: number): void {
  reconcile(state, now);
  const session = state.session;
  if (!session) return;
  if (action === "stop") {
    consume(session, now);
    finish(state, session, "stopped");
  } else if (action === "pause" && session.status === "running") {
    consume(session, now);
    session.status = "paused";
  } else if ((action === "resume" && session.status === "paused") ||
             (action === "next" && session.status === "ready")) {
    session.started = now;
    session.status = "running";
  } else if (action === "skip") {
    consume(session, now);
    advance(state, session, now, false);
  } else if (action === "restart") {
    consume(session, now);
    session.planned = (session.phase === "focus" ? session.routine.focus : session.routine[session.phase]) * minute;
    session.remaining = session.planned;
    session.started = now;
  } else if (action === "add") {
    consume(session, now);
    const increase = Math.min(5 * minute, maxBlockMinutes * minute - session.planned);
    session.planned += increase;
    session.remaining += increase;
  }
}

export function recover(state: Workspace, now: number, closedAt: number | null): void {
  if (state.session?.status !== "running") return;
  if (state.policies.quit === "continue") {
    reconcile(state, now);
    return;
  }
  const checkpoint = Math.max(state.session.started, state.checkpoint);
  const interrupted = closedAt !== null && closedAt >= checkpoint ? closedAt : checkpoint;
  act(state, "pause", Math.min(interrupted, now));
}
