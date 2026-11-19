import assert from "node:assert/strict";
import test from "node:test";
import { act, builtIns, decodeWorkspace, deletePreset, displayTime, minute,
  newWorkspace, reconcile, recover, savePreset, startSession, type Routine } from "../src/app/timer.ts";

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
