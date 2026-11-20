import test from "node:test";
import assert from "node:assert/strict";
import { focusTotals } from "../src/app/history.ts";
import { act, builtIns, decodeWorkspace, minute, newWorkspace, reconcile, recover, startSession } from "../src/app/timer.ts";

const start = new Date(2026, 10, 18, 15).getTime();
const countdown = { ...builtIns[3].routine, focus: 2 };

test("local history is opt-in and a stop records only the actual focus time", () => {
  const state = newWorkspace();
  startSession(state, countdown, "countdown", start, "Ring theory");
  act(state, "stop", start + minute);
  assert.equal(state.history.sessions.length, 0);
  state.history.enabled = true;
  startSession(state, countdown, "countdown", start, " Ring theory ");
  act(state, "pause", start + minute);
  act(state, "stop", start + 3 * minute);
  assert.deepEqual(state.history.sessions, [{
    endedAt: start + 3 * minute, subject: "Ring theory", reason: "stopped", focusTime: minute, name: countdown.name, builtInName: true,
  }]);
});

test("catch-up records the actual completion date only once", () => {
  const state = newWorkspace();
  state.policies.quit = "continue";
  state.history.enabled = true;
  startSession(state, countdown, "countdown", start);
  const restored = decodeWorkspace(JSON.stringify(state));
  recover(restored, start + 20 * minute, null);
  reconcile(restored, start + 40 * minute);
  assert.equal(restored.history.sessions.length, 1);
  assert.equal(restored.history.sessions[0].endedAt, start + 2 * minute);
  assert.equal(restored.history.sessions[0].focusTime, 2 * minute);
});

test("history can be suppressed for the current session after disabling or clearing", () => {
  const state = newWorkspace();
  state.history.enabled = true;
  startSession(state, countdown, "countdown", start);
  delete state.session!.studySubject;
  reconcile(state, start + 2 * minute);
  assert.equal(state.history.sessions.length, 0);
});

test("totals are grouped by local calendar day and a Monday-based week", () => {
  const state = newWorkspace();
  const date = (day: number) => new Date(2026, 10, day, 12).getTime();
  state.history.sessions = [15, 16, 18, 23].map(day => ({
    endedAt: date(day), reason: "finished", name: "Countdown", subject: "", focusTime: 2 * minute,
  }));
  assert.deepEqual(focusTotals(state.history, date(18)), { daily: 2 * minute, weekly: 4 * minute });
});

test("older workspaces default to English and preserve timer appearance", () => {
  const { language: _language, history: _history, ...old } = newWorkspace("Dark");
  old.desktop.mini.font = "Georgia";
  const state = decodeWorkspace(JSON.stringify(old));
  assert.equal(state.language, "en");
  assert.deepEqual(state.history, { enabled: false, sessions: [] });
  assert.equal(state.appearance.mode, "Dark");
  assert.equal(state.desktop.mini.font, "Georgia");
});

test("0.5.3 workspaces preserve settings and history when dropping the sidebar preference", () => {
  const old = { ...newWorkspace("Dark"), language: "da", compactSidebar: true };
  old.desktop.mini.font = "Georgia";
  old.history.enabled = true;
  startSession(old, countdown, "countdown", start, "Ring theory");
  act(old, "stop", start + minute);

  const state = decodeWorkspace(JSON.stringify(old));
  assert.equal(state.language, "da");
  assert.equal(state.appearance.mode, "Dark");
  assert.equal(state.desktop.mini.font, "Georgia");
  assert.deepEqual(state.history, old.history);
  assert.equal("compactSidebar" in state, false);
});
