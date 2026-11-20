import { newDesktopSettings, readDesktopSettings, type DesktopSettings } from "./desktopSettings.ts";
import { newAppearance, readAppearance, type Appearance, type DisplayMode } from "./appearance.ts";
import { historyLimit, readHistory, type StudyHistory } from "./history.ts";

export const minute = 60_000;
export const maxBlockMinutes = 720;

export type Phase = "focus" | "short" | "long";
export type Status = "running" | "paused" | "ready";
export type Policy = "pause" | "continue";
export type Interruption = "lock" | "sleep" | "quit";
export type Goal = { kind: "open" } | { kind: "rounds" | "focus"; amount: number };
export type TimerMode = "intervals" | "countdown" | "stopwatch" | "sequence" | "flowtime";
export type SequenceBlock = { name: string; kind: "focus" | "break"; minutes: number };
export type Sequence = { blocks: SequenceBlock[]; repeat: boolean };
export type FlowBreaks = { upTo25: number; upTo50: number; over50: number };
export type Routine = {
  name: string;
  kind: TimerMode;
  focus: number;
  short: number;
  long: number;
  longEvery: number;
  autoBreak: boolean;
  autoFocus: boolean;
  goal: Goal;
  sequence?: Sequence;
  flow?: FlowBreaks;
};
export type Preset = { id: string; routine: Routine };
export type Session = {
  routine: Routine;
  phase: Phase;
  status: Status;
  started: number;
  remaining: number | null;
  planned: number | null;
  elapsed: number;
  focusTotal: number;
  rounds: number;
  step?: number;
  flowBreak?: number;
  studySubject?: string;
  builtInName?: true;
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
  appearance: Appearance;
  history: StudyHistory;
  language: "en" | "da";
};
export type TimerAction = "pause" | "resume" | "next" | "skip" | "restart" | "add" | "stop";

const classic: Routine = {
  name: "Classic Pomodoro", kind: "intervals", focus: 25, short: 5, long: 15, longEvery: 4,
  autoBreak: true, autoFocus: true, goal: { kind: "open" },
};
export const sampleSequence: Sequence = {
  repeat: false, blocks: [
    { name: "Read", kind: "focus", minutes: 20 },
    { name: "Stretch", kind: "break", minutes: 5 },
    { name: "Practice", kind: "focus", minutes: 15 },
  ],
};
export const defaultFlowBreaks: FlowBreaks = { upTo25: 5, upTo50: 8, over50: 10 };

export const builtIns: Preset[] = [
  { id: "classic", routine: classic },
  { id: "focus45", routine: { ...classic, name: "45/5 Focus", focus: 45, longEvery: 0 } },
  { id: "focus90", routine: { ...classic, name: "90/15 Focus", focus: 90, short: 15, longEvery: 0 } },
  { id: "countdown", routine: { ...classic, name: "Countdown", kind: "countdown" } },
  { id: "stopwatch", routine: { ...classic, name: "Stopwatch", kind: "stopwatch" } },
  { id: "sequence", routine: { ...classic, name: "Review Sequence", kind: "sequence", sequence: sampleSequence } },
  { id: "flowtime", routine: { ...classic, name: "Flowtime", kind: "flowtime", flow: defaultFlowBreaks } },
];

export function newWorkspace(legacyMode?: DisplayMode): Workspace {
  return {
    version: 1, presets: [], nextPreset: 1, lastPreset: "classic",
    policies: { lock: "pause", sleep: "pause", quit: "pause" },
    session: null, result: null, transition: null, checkpoint: 0, desktop: newDesktopSettings(),
    appearance: newAppearance(legacyMode), history: readHistory(null), language: "en",
  };
}

function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
}

function isMinutes(value: unknown): value is number {
  return integer(value, 1, maxBlockMinutes);
}

function isName(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= 60;
}

export function validateRoutine(routine: Routine): void {
  if (!routine || !isName(routine.name)) throw new Error("Enter a preset name of up to 60 characters.");
  const { kind, goal } = routine;
  if (!["countdown", "intervals", "stopwatch", "sequence", "flowtime"].includes(kind)) {
    throw new Error("Choose a timer mode.");
  }
  if (typeof routine.autoBreak !== "boolean" || typeof routine.autoFocus !== "boolean") {
    throw new Error("Choose how the next intervals start.");
  }
  if (!goal || (goal.kind !== "open" && goal.kind !== "rounds" && goal.kind !== "focus")) {
    throw new Error("Choose when the session ends.");
  }
  if (goal.kind !== "open" && !integer(goal.amount, 1, goal.kind === "rounds" ? 999 : 1440)) {
    throw new Error("Enter a target of 1–999 rounds or 1–1,440 focus minutes.");
  }
  if (kind === "stopwatch" && goal.kind === "rounds") throw new Error("Choose a focus-time goal for the stopwatch.");
  if (((kind === "countdown" || kind === "intervals") && !isMinutes(routine.focus)) ||
      (kind === "intervals" && (!isMinutes(routine.short) || (routine.longEvery > 0 && !isMinutes(routine.long))))) {
    throw new Error("Enter whole-minute intervals between 1 and 720.");
  }
  if (kind === "intervals" && !integer(routine.longEvery, 0, 99)) {
    throw new Error("Enter 0 to disable long breaks, or choose 1–99 rounds.");
  }
  if (kind === "sequence") {
    const sequence = routine.sequence;
    if (!sequence || typeof sequence.repeat !== "boolean" || !Array.isArray(sequence.blocks) || !sequence.blocks.length) {
      throw new Error("Add at least one block to the sequence.");
    }
    if (sequence.blocks.some(block => !block || !isName(block.name) ||
        (block.kind !== "focus" && block.kind !== "break") || !isMinutes(block.minutes))) {
      throw new Error("Name each block and enter a duration between 1 and 720 minutes.");
    }
    if (goal.kind !== "open" && !sequence.blocks.some(block => block.kind === "focus")) {
      throw new Error("Add a focus block to use a focus-time or round goal.");
    }
  }
  if (kind === "flowtime") {
    const breaks = routine.flow;
    if (!breaks || ![breaks.upTo25, breaks.upTo50, breaks.over50].every(isMinutes)) {
      throw new Error("Enter suggested breaks between 1 and 720 minutes.");
    }
  }
}

function untimed(session: Session) {
  return session.routine.kind === "stopwatch" ||
    (session.routine.kind === "flowtime" && session.phase === "focus");
}

function decodeSession(session: Session) {
  validateRoutine(session.routine);
  if (!["focus", "short", "long"].includes(session.phase) ||
      !["running", "paused", "ready"].includes(session.status) ||
      !integer(session.started, 0) || !integer(session.focusTotal, 0) || !integer(session.rounds, 0)) throw new Error();
  if (untimed(session)) {
    if (session.planned !== null || session.remaining !== null || !integer(session.elapsed, 0)) throw new Error();
  } else {
    if (!integer(session.planned, 1, maxBlockMinutes * minute) || !integer(session.remaining, 1, session.planned)) throw new Error();
    if (session.elapsed === undefined) session.elapsed = session.planned - session.remaining;
    if (session.elapsed !== session.planned - session.remaining) throw new Error();
  }
  if (session.routine.kind === "sequence") {
    const blocks = session.routine.sequence!.blocks;
    if (!integer(session.step, 0, blocks.length - 1) ||
        session.phase !== (blocks[session.step].kind === "focus" ? "focus" : "short")) throw new Error();
  }
  if (session.routine.kind === "flowtime" && session.phase !== "focus" && !isMinutes(session.flowBreak)) throw new Error();
  if (typeof session.studySubject !== "string" || session.studySubject.length > 60) delete session.studySubject;
  if (session.builtInName !== true) delete session.builtInName;
}

export function decodeWorkspace(json: string, legacyMode?: DisplayMode): Workspace {
  try {
    const state = JSON.parse(json) as Workspace & { compactSidebar?: unknown };
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
    if (state.session !== null) decodeSession(state.session);
    const result = state.result;
    if (result !== null && (typeof result.name !== "string" || !integer(result.focusTime, 0) ||
        !integer(result.rounds, 0) || !["finished", "stopped"].includes(result.reason))) throw new Error();
    const transition = state.transition;
    if (transition !== null && (!integer(transition.id, 1) ||
        !["focus-ended", "break-ended", "finished"].includes(transition.event))) throw new Error();
    state.desktop = readDesktopSettings(state.desktop);
    state.appearance = readAppearance(state.appearance, legacyMode);
    state.history = readHistory(state.history);
    state.language = state.language === "da" ? "da" : "en";
    delete state.compactSidebar;
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

function selectedBlock(session: Session): SequenceBlock | undefined {
  return session.routine.kind === "sequence" ? session.routine.sequence?.blocks[session.step ?? 0] : undefined;
}

function blockDuration(session: Session): number | null {
  if (untimed(session)) return null;
  const custom = selectedBlock(session);
  if (custom) return custom.minutes * minute;
  if (session.routine.kind === "flowtime") return session.flowBreak! * minute;
  return session.routine[session.phase] * minute;
}

function resetBlock(session: Session, now: number) {
  session.started = now;
  session.elapsed = 0;
  session.planned = session.remaining = blockDuration(session);
}

export function startSession(state: Workspace, routine: Routine, presetId: string, now: number, subject = ""): void {
  if (state.session) throw new Error("Stop the current session before starting another.");
  validateRoutine(routine);
  if (![...builtIns, ...state.presets].some(preset => preset.id === presetId)) {
    throw new Error("Choose an available preset.");
  }
  const session: Session = {
    routine: structuredClone(routine), phase: "focus", status: "running",
    started: now, planned: null, remaining: null, elapsed: 0, focusTotal: 0, rounds: 0,
  };
  if (state.history.enabled) session.studySubject = subject.trim().slice(0, 60);
  if (builtIns.some(preset => preset.id === presetId && preset.routine.name === routine.name)) session.builtInName = true;
  if (routine.kind === "sequence") {
    session.step = 0;
    if (routine.sequence!.blocks[0].kind === "break") session.phase = "short";
  }
  resetBlock(session, now);
  state.session = session;
  state.lastPreset = presetId;
  state.result = null;
  state.checkpoint = now;
}

function goalLimit(session: Session): number {
  const { goal, kind } = session.routine;
  return kind !== "countdown" && goal.kind === "focus" && session.phase === "focus"
    ? Math.max(0, goal.amount * minute - session.focusTotal)
    : Infinity;
}

function availableTime(session: Session): number {
  return Math.min(session.remaining ?? Infinity, goalLimit(session));
}

function timeSpent(session: Session, now: number): number {
  return session.status === "running" ? Math.min(availableTime(session), Math.max(0, now - session.started)) : 0;
}

export function displayTime(session: Session, now: number) {
  const spent = timeSpent(session, now);
  const available = availableTime(session);
  const remaining = Number.isFinite(available) ? available - spent : null;
  const elapsed = session.elapsed + spent;
  const focusTotal = session.focusTotal + (session.phase === "focus" ? spent : 0);
  const goal = session.routine.goal;
  const countUp = session.planned === null;
  const progress = countUp
    ? goal.kind === "focus" ? Math.min(1, focusTotal / (goal.amount * minute)) : null
    : remaining === null ? null : elapsed + remaining === 0 ? 1 : elapsed / (elapsed + remaining);
  return { remaining, elapsed, focusTotal, countUp, progress };
}

export function phaseName(session: Session): string {
  if (session.routine.kind === "flowtime" && session.phase !== "focus") return "Break";
  return selectedBlock(session)?.name || ({ focus: "Focus", short: "Short break", long: "Long break" })[session.phase];
}

export function suggestFlowBreak(routine: Routine, elapsed: number): number {
  const breaks = routine.flow ?? defaultFlowBreaks;
  if (elapsed <= 25 * minute) return breaks.upTo25;
  if (elapsed <= 50 * minute) return breaks.upTo50;
  return breaks.over50;
}

function record(state: Workspace, event: Transition["event"]): void {
  state.transition = { id: (state.transition?.id ?? 0) + 1, event };
}

function consume(session: Session, now: number): void {
  if (session.status !== "running") return;
  const spent = timeSpent(session, now);
  if (session.remaining !== null) session.remaining -= spent;
  session.elapsed += spent;
  if (session.phase === "focus") session.focusTotal += spent;
  session.started = now;
}

function finish(state: Workspace, session: Session, reason: "finished" | "stopped", endedAt: number): void {
  state.result = { name: session.routine.name, focusTime: session.focusTotal, rounds: session.rounds, reason };
  state.session = null;
  if (state.history.enabled && session.studySubject !== undefined && session.focusTotal > 0) {
    const entry = { name: session.routine.name, subject: session.studySubject, endedAt, focusTime: session.focusTotal, reason,
      ...(session.builtInName ? { builtInName: session.builtInName } : {}) };
    state.history.sessions = [...state.history.sessions, entry].slice(-historyLimit);
  }
  if (reason === "finished" || state.desktop.alertOnStop) record(state, "finished");
}

function setNextBlock(state: Workspace, session: Session, phase: Phase, now: number, automatic: boolean) {
  record(state, session.phase === "focus" ? "focus-ended" : "break-ended");
  session.phase = phase;
  session.status = automatic ? "running" : "ready";
  resetBlock(session, now);
}

function roundsReached(session: Session) {
  const goal = session.routine.goal;
  return goal.kind === "rounds" && session.rounds >= goal.amount;
}

function advance(state: Workspace, session: Session, now: number, completed: boolean): void {
  const { routine, phase } = session;
  if (completed && phase === "focus") session.rounds++;
  if (routine.kind === "countdown" || routine.kind === "stopwatch" ||
      (routine.goal.kind === "focus" && session.focusTotal >= routine.goal.amount * minute)) {
    finish(state, session, "finished", now);
    return;
  }
  if (routine.kind === "sequence") {
    const { blocks, repeat } = routine.sequence!;
    const index = (session.step ?? 0) + 1;
    const hasMore = index < blocks.length;
    const goalStopsNow = roundsReached(session) &&
      (repeat || blocks.slice(index).some(block => block.kind === "focus"));
    if ((!hasMore && !repeat) || goalStopsNow) {
      finish(state, session, "finished", now);
      return;
    }
    session.step = index % blocks.length;
    const focus = blocks[session.step].kind === "focus";
    setNextBlock(state, session, focus ? "focus" : "short", now, focus ? routine.autoFocus : routine.autoBreak);
    return;
  }
  if (roundsReached(session)) {
    finish(state, session, "finished", now);
    return;
  }
  if (phase !== "focus") {
    setNextBlock(state, session, "focus", now, routine.autoFocus);
  } else {
    const long = completed && routine.longEvery > 0 && session.rounds % routine.longEvery === 0;
    setNextBlock(state, session, long ? "long" : "short", now, routine.autoBreak);
  }
}

export function takeFlowBreak(state: Workspace, minutes: number, now: number): void {
  if (!isMinutes(minutes)) throw new Error("Enter a break between 1 and 720 minutes.");
  reconcile(state, now);
  const session = state.session;
  if (!session || session.routine.kind !== "flowtime" || session.phase !== "focus" || session.status === "ready") {
    throw new Error("Start a Flowtime focus block before taking a break.");
  }
  consume(session, now);
  session.rounds++;
  if (roundsReached(session)) {
    finish(state, session, "finished", now);
    return;
  }
  session.flowBreak = minutes;
  setNextBlock(state, session, "short", now, true);
}

function fastForwardRounds(state: Workspace, session: Session, now: number): void {
  const routine = session.routine;
  if (session.remaining === null || now - session.started < session.remaining ||
      session.elapsed !== 0 || session.remaining !== blockDuration(session)) return;
  if (routine.kind === "intervals" && routine.goal.kind === "open" && routine.autoBreak && routine.autoFocus
      && session.phase === "focus") {
    const rounds = routine.longEvery || 1;
    const focus = routine.focus * minute * rounds;
    const cycle = focus + (routine.short * rounds + (routine.longEvery ? routine.long - routine.short : 0)) * minute;
    const cycles = Math.floor((now - session.started) / cycle);
    if (cycles <= 0) return;
    session.rounds += cycles * rounds;
    session.focusTotal += cycles * focus;
    session.started += cycles * cycle;
    record(state, "break-ended");
  } else if (routine.kind === "sequence" && routine.sequence!.repeat) {
    const { blocks } = routine.sequence!;
    if (blocks.some(block => block.kind === "focus" ? !routine.autoFocus : !routine.autoBreak)) return;
    const cycle = blocks.reduce((sum, block) => sum + block.minutes * minute, 0);
    const focusBlocks = blocks.filter(block => block.kind === "focus");
    const focus = focusBlocks.reduce((sum, block) => sum + block.minutes * minute, 0);
    let cycles = Math.floor((now - session.started) / cycle);
    const goal = routine.goal;
    if (goal.kind === "focus" && focus) cycles = Math.min(cycles, Math.floor((goal.amount * minute - session.focusTotal - 1) / focus));
    if (goal.kind === "rounds" && focusBlocks.length) cycles = Math.min(cycles, Math.floor((goal.amount - session.rounds - 1) / focusBlocks.length));
    if (cycles <= 0) return;
    session.rounds += cycles * focusBlocks.length;
    session.focusTotal += cycles * focus;
    session.started += cycles * cycle;
    const previous = blocks[((session.step ?? 0) + blocks.length - 1) % blocks.length];
    record(state, previous.kind === "focus" ? "focus-ended" : "break-ended");
  }
}

// Reconcile deadlines. A delayed refresh consumes elapsed time in the correct intervals.
export function reconcile(state: Workspace, now: number): boolean {
  let changed = false;
  const initial = state.transition?.id;
  const session = state.session;
  if (!session || session.status !== "running") return changed;
  while (state.session && session.status === "running") {
    fastForwardRounds(state, session, now);
    const duration = availableTime(session);
    const end = session.started + duration;
    if (end > now) break;
    const completed = duration === session.remaining || session.routine.kind === "stopwatch";
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
    finish(state, session, "stopped", now);
  } else if (action === "pause" && session.status === "running") {
    consume(session, now);
    session.status = "paused";
  } else if ((action === "resume" && session.status === "paused") ||
             (action === "next" && session.status === "ready")) {
    session.started = now;
    session.status = "running";
  } else if (action === "skip" && session.remaining !== null) {
    consume(session, now);
    advance(state, session, now, false);
  } else if (action === "restart") {
    consume(session, now);
    resetBlock(session, now);
  } else if (action === "add" && session.planned !== null && session.remaining !== null) {
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
