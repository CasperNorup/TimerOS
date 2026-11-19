import { useState } from "react";
import { act, builtIns, deletePreset, displayTime, maxBlockMinutes, minute, savePreset, startSession,
  type Goal, type Routine, type Session, type TimerAction, type Workspace } from "./timer";
import type { useTimer } from "./useTimer";
import { formatRemaining as clock, progressOf } from "./useDesktop";

type Model = ReturnType<typeof useTimer>;

const phases = { focus: "Focus", short: "Short break", long: "Long break" };

function SessionCard({ session, model }: { session: Session; model: Model }) {
  const reading = displayTime(session, model.now);
  const progress = progressOf(session, reading.remaining);
  const primary: TimerAction = session.status === "running" ? "pause" : session.status === "ready" ? "next" : "resume";
  const mainLabel = { pause: "Pause", resume: "Resume", next: "Start next interval" }[primary];
  const send = (action: TimerAction) => void model.update((state, time) => act(state, action, time));

  return (
    <section className="panel timer" aria-label="Current session">
      <h2>{session.routine.name}</h2>
      <p className="phase">
        {phases[session.phase]}{session.status === "paused" ? " · Paused" : session.status === "ready" ? " · Ready" : ""}
      </p>
      <p className="time" aria-label="Time remaining">{clock(reading.remaining)}</p>
      <progress max={1} value={Math.max(0, Math.min(1, progress))} aria-label="Interval progress" />
      {session.routine.kind === "intervals" && (
        <p className="intervals">
          {session.rounds} {session.rounds === 1 ? "round" : "rounds"} completed
          {session.routine.goal.kind === "focus" && " · " + clock(reading.focusTotal) + " focus"}
        </p>
      )}
      <div className="controls">
        <button className="primary" type="button" disabled={model.busy} onClick={() => send(primary)}>{mainLabel}</button>
        <button type="button" disabled={model.busy} onClick={() => send("add")}>+5 min</button>
        {session.routine.kind === "intervals" && (
          <button type="button" disabled={model.busy} onClick={() => send("skip")}>Skip</button>
        )}
        <button type="button" disabled={model.busy} onClick={() => send("restart")}>Restart</button>
        <button type="button" disabled={model.busy} onClick={() => send("stop")}>Stop</button>
      </div>
    </section>
  );
}

function Minutes({ label, value, min = 1, max = maxBlockMinutes, set }: {
  label: string; value: number; min?: number; max?: number; set: (value: number) => void;
}) {
  return <label className="field">
    <span>{label}</span>
    <input type="number" min={min} max={max} step={1} required value={Number.isNaN(value) ? "" : value}
      onChange={event => set(event.currentTarget.valueAsNumber)} />
  </label>;
}

function PresetSetup({ view, model, onStart }: { view: Workspace; model: Model; onStart: () => void }) {
  const presets = [...builtIns, ...view.presets];
  const [selected, setSelected] = useState(view.lastPreset);
  const [routine, setRoutine] = useState(() => structuredClone(presets.find(p => p.id === view.lastPreset)!.routine));
  const [deleting, confirmDelete] = useState(false);
  const own = view.presets.some(preset => preset.id === selected);

  function choose(id: string) {
    const preset = presets.find(p => p.id === id);
    if (!preset) return;
    setSelected(id);
    setRoutine(structuredClone(preset.routine));
    confirmDelete(false);
  }

  function change<K extends keyof Routine>(key: K, value: Routine[K]) {
    setRoutine(previous => ({ ...previous, [key]: value }));
  }

  function store(update: boolean, copy = false) {
    const saved = copy ? { ...routine, name: routine.name.trim().slice(0, 55) + " copy" } : routine;
    let targetId = selected;
    void model.update(state => {
      targetId = savePreset(state, saved, update ? selected : undefined).id;
      state.lastPreset = targetId;
    }).then(ok => {
      if (ok) {
        setSelected(targetId);
        setRoutine(saved);
      }
    });
  }

  function remove() {
    void model.update(state => deletePreset(state, selected)).then(ok => {
      if (ok) choose("classic");
    });
  }

  function changeGoal(kind: Goal["kind"]) {
    change("goal", kind === "open" ? { kind } : { kind, amount: kind === "rounds" ? 4 : 120 });
  }

  return (
    <form className="timer-setup" onSubmit={event => {
      event.preventDefault();
      void model.update((state, time) => startSession(state, routine, selected, time)).then(ok => { if (ok) onStart(); });
    }}>
      {view.result && (
        <p className="result" role="status">
          {view.result.reason === "finished" ? "Session complete" : "Session stopped"} · {clock(view.result.focusTime)} focus
        </p>
      )}
      <section className="panel timer" aria-label="Timer setup">
        <label className="field">
          <span>Preset</span>
          <select value={selected} onChange={event => choose(event.currentTarget.value)}>
            <optgroup label="Built-in presets">
              {builtIns.map(p => <option key={p.id} value={p.id}>{p.routine.name}</option>)}
            </optgroup>
            {view.presets.length > 0 && <optgroup label="My presets">
              {view.presets.map(p => <option key={p.id} value={p.id}>{p.routine.name}</option>)}
            </optgroup>}
          </select>
        </label>
        <p className="time" aria-label="Focus duration">{Number.isFinite(routine.focus) && routine.focus > 0 ? clock(routine.focus * minute) : "–:––"}</p>
        {routine.kind === "intervals" && <p className="intervals">{routine.focus} min focus · {routine.short} min break</p>}
        {routine.kind === "countdown" && (
          <div className="controls" aria-label="Quick countdown durations">
            {[5, 15, 25, 45].map(value => (
              <button key={value} type="button" aria-pressed={value === routine.focus} onClick={() => change("focus", value)}>
                {value} min
              </button>
            ))}
          </div>
        )}
        <div className="controls">
          <button className="primary" type="submit" disabled={model.busy}>Start</button>
        </div>
      </section>
      <details className="panel edit">
        <summary>Customize session or preset</summary>
        <div className="edit-fields">
          <label className="field">
            <span>Preset name</span>
            <input value={routine.name} maxLength={60} required onChange={event => change("name", event.currentTarget.value)} />
          </label>
          <label className="field">
            <span>Timer mode</span>
            <select value={routine.kind} onChange={event => change("kind", event.currentTarget.value as Routine["kind"])}>
              <option value="intervals">Focus and break intervals</option>
              <option value="countdown">Single countdown</option>
            </select>
          </label>
          <Minutes label="Focus (min)" value={routine.focus} set={value => change("focus", value)} />
          {routine.kind === "intervals" && <>
            <Minutes label="Short break (min)" value={routine.short} set={value => change("short", value)} />
            <Minutes label="Long break every N rounds" min={0} max={99} value={routine.longEvery} set={value => change("longEvery", value)} />
            {routine.longEvery !== 0 && <Minutes label="Long break (min)" value={routine.long} set={value => change("long", value)} />}
            <label className="field">
              <span>Session ends</span>
              <select value={routine.goal.kind} onChange={event => changeGoal(event.currentTarget.value as Goal["kind"])}>
                <option value="open">When I press Stop</option>
                <option value="rounds">After a number of rounds</option>
                <option value="focus">At a focus-time target</option>
              </select>
            </label>
            {routine.goal.kind === "rounds" && <Minutes label="Focus rounds" value={routine.goal.amount} max={999}
              set={amount => change("goal", { kind: "rounds", amount })} />}
            {routine.goal.kind === "focus" && <Minutes label="Focus target (min)" value={routine.goal.amount} max={1440}
              set={amount => change("goal", { kind: "focus", amount })} />}
            <label className="check"><input type="checkbox" checked={routine.autoBreak}
              onChange={event => change("autoBreak", event.currentTarget.checked)} /> Start breaks automatically</label>
            <label className="check"><input type="checkbox" checked={routine.autoFocus}
              onChange={event => change("autoFocus", event.currentTarget.checked)} /> Start focus intervals automatically</label>
          </>}
        </div>
        <div className="controls preset-controls">
          {own && <button type="button" disabled={model.busy} onClick={() => store(true)}>Save preset</button>}
          <button type="button" disabled={model.busy} onClick={() => store(false)}>Save as new preset</button>
          <button type="button" disabled={model.busy} onClick={() => store(false, true)}>Duplicate</button>
          {own && !deleting && <button type="button" disabled={model.busy} onClick={() => confirmDelete(true)}>Delete</button>}
        </div>
        {deleting && (
          <div className="delete-preset">
            <p>Delete this preset?</p>
            <div className="controls">
              <button type="button" onClick={() => confirmDelete(false)}>Cancel</button>
              <button type="button" disabled={model.busy} onClick={remove}>Delete preset</button>
            </div>
          </div>
        )}
      </details>
    </form>
  );
}

export function TimerPage({ model, onStart }: { model: Model; onStart: () => void }) {
  return (
    <>
      <h1 id="page-title">Timer</h1>
      {model.view?.session && <SessionCard session={model.view.session} model={model} />}
      {model.view && !model.view.session && <PresetSetup view={model.view} model={model} onStart={onStart} />}
    </>
  );
}
