import assert from "node:assert/strict";
import test from "node:test";
import { act, builtIns, decodeWorkspace, defaultFlowBreaks, deletePreset, displayTime, minute, phaseName,
  newWorkspace, reconcile, recover, savePreset, startSession, suggestFlowBreak, takeFlowBreak,
  type Routine } from "../src/app/timer.ts";
import { normalizeShortcut, pulsePeriod, readDesktopSettings } from "../src/app/desktopSettings.ts";

const start = 1_000_000;
const classic = builtIns[0].routine;

function session(overrides: Partial<Routine> = {}) {
  const state = newWorkspace();
  startSession(state, { ...classic, ...overrides }, "classic", start);
  return state;
}
test("countdown reaches one natural completion at its deadline", () => {
  const state = session({ kind: "countdown", focus: 2 });
  assert.equal(displayTime(state.session!, start + minute).remaining, minute);
  assert.ok(reconcile(state, start + 2 * minute));
  assert.equal(state.session, null);
  assert.deepEqual(state.result, { name: classic.name, reason: "finished", focusTime: 2 * minute, rounds: 1 });
  assert.equal(state.transition?.event, "finished");
  assert.equal(reconcile(state, start + 10 * minute), false);
  assert.equal(state.transition?.id, 1);
});
test("pause, add time, resume, restart, and stop preserve actual focus time", () => {
  const state = session({ focus: 10, kind: "countdown" });
  act(state, "pause", start + 2 * minute);
  assert.equal(displayTime(state.session!, start + 20 * minute).remaining, 8 * minute);
  act(state, "add", start + 20 * minute);
  assert.equal(state.session?.remaining, 13 * minute);
  act(state, "resume", start + 20 * minute);
  act(state, "restart", start + 22 * minute);
  assert.equal(state.session?.remaining, 10 * minute);
  act(state, "stop", start + 25 * minute);
  assert.equal(state.result?.focusTime, 7 * minute);
  assert.equal(state.result?.reason, "stopped");
  assert.equal(state.transition, null);
});
test("manual transition signals once and waits until Start Next Interval", () => {
  const state = session({ focus: 2, short: 1, autoBreak: false, autoFocus: false });
  reconcile(state, start + 30 * minute);
  assert.equal(state.session?.status, "ready");
  assert.equal(state.session?.phase, "short");
  assert.equal(state.session?.remaining, minute);
  assert.equal(state.transition?.event, "focus-ended");
  reconcile(state, start + 31 * minute);
  assert.equal(state.transition?.id, 1);
  act(state, "next", start + 32 * minute);
  reconcile(state, start + 33 * minute);
  assert.equal(state.session?.status, "ready");
  assert.equal(state.session?.phase, "focus");
  assert.equal(state.transition?.event, "break-ended");
});
test("Pomodoro long-break cadence and fixed rounds stop at the last focus", () => {
  const state = session({ focus: 1, short: 1, long: 3, longEvery: 2, goal: { kind: "rounds", amount: 3 } });
  reconcile(state, start + 3 * minute);
  assert.equal(state.session?.phase, "long");
  assert.equal(state.session?.rounds, 2);
  reconcile(state, start + 7 * minute);
  assert.equal(state.session, null);
  assert.equal(state.result?.rounds, 3);
  assert.equal(state.result?.focusTime, 3 * minute);
});
test("skip counts elapsed focus only and does not complete a round", () => {
  const state = session({ focus: 2, short: 1, goal: { kind: "rounds", amount: 1 } });
  act(state, "skip", start + minute);
  assert.equal(state.session?.rounds, 0);
  assert.equal(state.session?.focusTotal, minute);
  reconcile(state, start + 4 * minute);
  assert.equal(state.result?.rounds, 1);
  assert.equal(state.result?.focusTime, 3 * minute);
});
test("study target ends inside the next focus block, excluding breaks", () => {
  const state = session({ focus: 2, short: 1, goal: { kind: "focus", amount: 3 } });
  reconcile(state, start + 3 * minute);
  assert.equal(displayTime(state.session!, start + 3 * minute).remaining, minute);
  reconcile(state, start + 4 * minute);
  assert.equal(state.session, null);
  assert.equal(state.result?.rounds, 1);
  assert.equal(state.result?.focusTime, 3 * minute);
});
test("restart recovery pauses at a clean quit or saved checkpoint", () => {
  const saved = session({ focus: 10 });
  saved.checkpoint = start + minute;
  const clean = decodeWorkspace(JSON.stringify(saved));
  recover(clean, start + 20 * minute, start + 3 * minute);
  assert.equal(clean.session?.status, "paused");
  assert.equal(clean.session?.remaining, 7 * minute);
  recover(saved, start + 20 * minute, null);
  assert.equal(saved.session?.status, "paused");
  assert.equal(saved.session?.remaining, 9 * minute);
});
test("keep-running recovery catches up once and handles long gaps", () => {
  const state = session({ focus: 1, short: 1, long: 2, longEvery: 2 });
  state.policies.quit = "continue";
  const reopened = start + 500_000 * minute;
  recover(state, reopened, start);
  assert.equal(state.session?.rounds, 200_000);
  assert.equal(state.session?.phase, "focus");
  assert.equal(state.session?.started, reopened);
  assert.equal(state.session?.remaining, minute);
  assert.equal(state.transition?.id, 1);
  recover(state, reopened, start);
  assert.equal(state.transition?.id, 1);
});
test("new presets, duplicate, update and delete preserve old session settings", () => {
  const state = newWorkspace();
  const original = savePreset(state, { ...classic, name: "Lecture", focus: 50 });
  const duplicate = savePreset(state, { ...original.routine, name: "Lecture copy" });
  startSession(state, original.routine, original.id, start);
  savePreset(state, { ...original.routine, focus: 20 }, original.id);
  deletePreset(state, original.id);
  assert.equal(state.lastPreset, "classic");
  assert.equal(state.session?.routine.focus, 50);
  assert.equal(state.presets[0].id, duplicate.id);
  assert.deepEqual(decodeWorkspace(JSON.stringify(state)), state);
  assert.throws(() => savePreset(state, { ...classic, focus: 0 }));
  assert.throws(() => decodeWorkspace('{"version":9}'));
});

test("older workspaces keep their presets and get quiet desktop defaults", () => {
  const state = newWorkspace();
  savePreset(state, { ...classic, name: "Phase 1 study" });
  const { desktop: _desktop, ...phaseOne } = state;
  const migrated = decodeWorkspace(JSON.stringify(phaseOne));
  assert.equal(migrated.presets[0].routine.name, "Phase 1 study");
  assert.equal(migrated.desktop.sound, false);
  assert.equal(migrated.desktop.target, "all");
  assert.equal(migrated.desktop.mini.placement, "right");
});

test("desktop settings enforce bounded pulse timing and valid shortcuts", () => {
  const settings = readDesktopSettings({
    mini: { freeX: 2, opacity: 0, color: "invalid" },
    shortcuts: { dismiss: "alt+ctrl+f10" },
    cues: { finished: { opacity: 100, count: 15 } },
  });
  assert.equal(settings.mini.freeX, 1);
  assert.equal(settings.mini.opacity, 35);
  assert.equal(settings.mini.color, "#111e35");
  assert.equal(settings.shortcuts.dismiss, "Ctrl+Alt+F10");
  assert.equal(settings.cues.finished.opacity, 55);
  assert.equal(settings.cues.finished.count, 6);
  assert.throws(() => normalizeShortcut("Shift+F8"));
  assert.equal(pulsePeriod(250, 0), 2000);
});

test("stopwatch counts up, skips a determinate bar, and preserves actual focus across restart", () => {
  const state = session({ kind: "stopwatch" });
  const at = minutes => start + minutes * minute;
  assert.deepEqual(displayTime(state.session!, at(7)), {
    remaining: null, elapsed: 7 * minute, focusTotal: 7 * minute, countUp: true, progress: null,
  });
  act(state, "pause", at(7));
  assert.equal(displayTime(state.session!, at(15)).elapsed, 7 * minute);
  act(state, "resume", at(15));
  act(state, "restart", at(18));
  assert.equal(displayTime(state.session!, at(19)).elapsed, minute);
  assert.equal(reconcile(state, at(900)), false);
  act(state, "stop", at(20));
  assert.equal(state.result?.focusTime, 12 * minute);
  assert.equal(state.transition, null);
});

test("stopwatch stops once at its optional focus-time goal", () => {
  const state = session({ kind: "stopwatch", goal: { kind: "focus", amount: 4 } });
  assert.equal(displayTime(state.session!, start + minute).progress, .25);
  assert.equal(reconcile(state, start + 8 * minute), true);
  assert.equal(state.result?.focusTime, 4 * minute);
  assert.equal(state.transition?.event, "finished");
  assert.equal(reconcile(state, start + 12 * minute), false);
  assert.equal(state.transition?.id, 1);
});

test("sequence follows the saved names and pauses at a manual transition", () => {
  const state = session({
    kind: "sequence", autoBreak: false,
    sequence: { repeat: false, blocks: [
      { name: "Review", kind: "focus", minutes: 2 },
      { name: "Water", kind: "break", minutes: 1 },
      { name: "Recall", kind: "focus", minutes: 3 },
    ] },
  });
  assert.equal(phaseName(state.session!), "Review");
  assert.equal(reconcile(state, start + 5 * minute), true);
  assert.equal(state.session?.status, "ready");
  assert.equal(phaseName(state.session!), "Water");
  assert.equal(state.transition?.event, "focus-ended");
  assert.equal(displayTime(state.session!, start + 8 * minute).focusTotal, 2 * minute);
  act(state, "next", start + 8 * minute);
  reconcile(state, start + 9 * minute);
  assert.equal(phaseName(state.session!), "Recall");
  assert.equal(state.transition?.event, "break-ended");
  act(state, "add", start + 10 * minute);
  act(state, "restart", start + 11 * minute);
  assert.equal(state.session?.remaining, 3 * minute);
  reconcile(state, start + 14 * minute);
  assert.equal(state.session, null);
  assert.equal(state.result?.focusTime, 7 * minute);
  assert.equal(state.transition?.event, "finished");
});

test("single-pass round goals preserve deliberately trailing breaks", () => {
  const blocks = [{ name: "Read", kind: "focus", minutes: 1 }, { name: "Stretch", kind: "break", minutes: 2 }] as const;
  const state = session({ kind: "sequence", sequence: { repeat: false, blocks: [...blocks] }, goal: { kind: "rounds", amount: 1 } });
  reconcile(state, start + minute);
  assert.equal(phaseName(state.session!), "Stretch");
  assert.equal(state.transition?.event, "focus-ended");
  reconcile(state, start + 3 * minute);
  assert.equal(state.result?.rounds, 1);
  assert.equal(state.result?.focusTime, minute);
  assert.equal(state.transition?.event, "finished");
  const early = session({
    kind: "sequence", goal: { kind: "rounds", amount: 1 },
    sequence: { repeat: false, blocks: [...blocks, { name: "Practice", kind: "focus", minutes: 1 }] },
  });
  reconcile(early, start + minute);
  assert.equal(early.session, null);
  assert.equal(early.transition?.event, "finished");
});

test("repeating sequences fast-forward across long gaps and stop at a mid-block focus goal", () => {
  const sequence = { repeat: true, blocks: [
    { name: "Stretch", kind: "break" as const, minutes: 1 },
    { name: "Proofs", kind: "focus" as const, minutes: 2 },
  ] };
  const open = session({ kind: "sequence", sequence });
  open.policies.quit = "continue";
  recover(open, start + 300_000 * minute, start);
  assert.equal(open.session?.rounds, 100_000);
  assert.equal(open.session?.focusTotal, 200_000 * minute);
  assert.equal(phaseName(open.session!), "Stretch");
  assert.equal(open.transition?.id, 1);

  const goal = session({ kind: "sequence", sequence, goal: { kind: "focus", amount: 5 } });
  assert.equal(reconcile(goal, start + 100 * minute), true);
  assert.equal(goal.result?.rounds, 2);
  assert.equal(goal.result?.focusTime, 5 * minute);
  assert.equal(goal.transition?.event, "finished");
  assert.equal(reconcile(goal, start + 101 * minute), false);
});

test("Flowtime suggests by active focus, accepts overrides and returns to an elapsed clock", () => {
  const flow = { upTo25: 3, upTo50: 7, over50: 12 };
  const state = session({ kind: "flowtime", flow, autoFocus: false });
  assert.equal(suggestFlowBreak(state.session!.routine, 25 * minute), 3);
  assert.equal(suggestFlowBreak(state.session!.routine, 25 * minute + 1), 7);
  assert.equal(suggestFlowBreak(state.session!.routine, 50 * minute), 7);
  assert.equal(suggestFlowBreak(state.session!.routine, 50 * minute + 1), 12);
  act(state, "pause", start + 18 * minute);
  assert.equal(suggestFlowBreak(state.session!.routine, displayTime(state.session!, start + 60 * minute).elapsed), 3);
  takeFlowBreak(state, 2, start + 60 * minute);
  assert.equal(phaseName(state.session!), "Break");
  assert.equal(displayTime(state.session!, start + 61 * minute).remaining, minute);
  assert.equal(state.transition?.event, "focus-ended");
  act(state, "add", start + 61 * minute);
  act(state, "restart", start + 61 * minute);
  assert.equal(state.session?.remaining, 2 * minute);
  reconcile(state, start + 70 * minute);
  assert.equal(state.session?.status, "ready");
  assert.equal(state.transition?.event, "break-ended");
  assert.equal(displayTime(state.session!, start + 71 * minute).elapsed, 0);
  act(state, "next", start + 71 * minute);
  assert.equal(displayTime(state.session!, start + 72 * minute).elapsed, minute);
  assert.equal(displayTime(state.session!, start + 72 * minute).focusTotal, 19 * minute);
});

test("Flowtime finishes at a round goal without starting an extra break", () => {
  const state = session({ kind: "flowtime", flow: defaultFlowBreaks, goal: { kind: "rounds", amount: 1 } });
  takeFlowBreak(state, 5, start + 8 * minute);
  assert.equal(state.session, null);
  assert.equal(state.result?.rounds, 1);
  assert.equal(state.result?.focusTime, 8 * minute);
  assert.equal(state.transition?.event, "finished");
});

test("recovery keeps timed legacy checkpoints and new count-up state readable", () => {
  const old = session();
  act(old, "pause", start + 2 * minute);
  const { elapsed: _elapsed, ...legacy } = old.session!;
  const upgraded = decodeWorkspace(JSON.stringify({ ...old, session: legacy }));
  assert.equal(upgraded.session?.elapsed, 2 * minute);
  assert.equal(upgraded.session?.remaining, 23 * minute);
  const flow = session({ kind: "flowtime", flow: defaultFlowBreaks });
  flow.checkpoint = start + 3 * minute;
  const decoded = decodeWorkspace(JSON.stringify(flow));
  recover(decoded, start + 5 * minute, null);
  assert.equal(decoded.session?.status, "paused");
  assert.equal(decoded.session?.elapsed, 3 * minute);
  assert.equal(displayTime(decoded.session!, start + 8 * minute).progress, null);
});
