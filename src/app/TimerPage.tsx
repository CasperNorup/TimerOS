import { useState } from "react";
import { act, builtIns, defaultFlowBreaks, deletePreset, displayTime, maxBlockMinutes, minute, phaseName,
  sampleSequence, savePreset, startSession, suggestFlowBreak, takeFlowBreak,
  type Goal, type Routine, type Sequence, type SequenceBlock, type Session, type TimerAction, type TimerMode,
  type Workspace } from "./timer";
import type { useTimer } from "./useTimer";
import { formatClock as clock } from "./useDesktop";

type Model = ReturnType<typeof useTimer>;
type BreakChoice = { suggested: number; minutes: number; resumeOnCancel: boolean };

function SessionCard({ session, model }: { session: Session; model: Model }) {
  const [choice, setChoice] = useState<BreakChoice | null>(null);
  const reading = displayTime(session, model.now);
  const primary: TimerAction = session.status === "running" ? "pause" : session.status === "ready" ? "next" : "resume";
  const mainLabel = { pause: "Pause", resume: "Resume", next: "Start next interval" }[primary];
  const send = (action: TimerAction) => void model.update((state, time) => act(state, action, time));
  const flowFocus = session.routine.kind === "flowtime" && session.phase === "focus" && session.status !== "ready";
  const canSkip = session.planned !== null && session.routine.kind !== "countdown";
  const editingBreak = flowFocus ? choice : null;
  const focusGoal = session.routine.kind !== "countdown" && session.routine.goal.kind === "focus";

  function offerBreak() {
    let suggested: number | undefined;
    let resumeOnCancel = false;
    void model.update((state, now) => {
      const active = state.session;
      if (!active || active.routine.kind !== "flowtime" || active.phase !== "focus" || active.status === "ready") return;
      resumeOnCancel = active.status === "running";
      act(state, "pause", now);
      if (state.session === active) suggested = suggestFlowBreak(active.routine, active.elapsed);
    }).then(ok => {
      if (ok && suggested !== undefined) setChoice({ suggested, minutes: suggested, resumeOnCancel });
    });
  }

  return (
    <section className="panel timer" aria-label="Current session">
      <h2>{session.routine.name}</h2>
      <p className="phase">
        {phaseName(session)}{session.status === "paused" ? " · Paused" : session.status === "ready" ? " · Ready" : ""}
      </p>
      <p className="time" aria-label={reading.countUp ? "Time elapsed" : "Time remaining"}>
        {clock(reading.countUp ? reading.elapsed : reading.remaining ?? 0, reading.countUp)}
      </p>
      {reading.progress !== null && <progress max={1} value={reading.progress}
        aria-label={reading.countUp ? "Focus goal progress" : "Interval progress"} />}
      {(session.routine.kind !== "countdown" && session.routine.kind !== "stopwatch" || focusGoal) && (
        <p className="intervals">
          {session.routine.kind === "sequence" && "Block " + ((session.step ?? 0) + 1) + " of " + session.routine.sequence!.blocks.length + " · "}
          {session.routine.kind !== "stopwatch" && session.rounds + (session.rounds === 1 ? " round completed" : " rounds completed")}
          {focusGoal && (session.routine.kind !== "stopwatch" ? " · " : "") + clock(reading.focusTotal, true) + " focus"}
        </p>
      )}
      {editingBreak ? (
        <form className="flow-break" onSubmit={event => {
          event.preventDefault();
          void model.update((state, time) => takeFlowBreak(state, editingBreak.minutes, time)).then(ok => {
            if (ok) setChoice(null);
          });
        }}>
          {session.routine.goal.kind === "rounds" && session.rounds + 1 >= session.routine.goal.amount ? (
            <p className="intervals">This focus block completes your round goal.</p>
          ) : (
            <>
              <p className="intervals">Suggested break · {editingBreak.suggested} min</p>
              <Minutes label="Break duration (min)" value={editingBreak.minutes}
                set={minutes => setChoice({ ...editingBreak, minutes })} />
            </>
          )}
          <div className="controls">
            <button type="submit" className="primary" disabled={model.busy}>
              {session.routine.goal.kind === "rounds" && session.rounds + 1 >= session.routine.goal.amount
                ? "Finish session" : "Start break"}
            </button>
            <button type="button" disabled={model.busy} onClick={() => {
              if (editingBreak.resumeOnCancel) {
                void model.update((state, time) => act(state, "resume", time)).then(ok => { if (ok) setChoice(null); });
              } else setChoice(null);
            }}>Cancel</button>
            <button type="button" disabled={model.busy} onClick={() => send("stop")}>Stop</button>
          </div>
        </form>
      ) : (
        <div className="controls">
          <button className={flowFocus ? undefined : "primary"} type="button" disabled={model.busy}
            onClick={() => send(primary)}>{mainLabel}</button>
          {flowFocus && <button className="primary" type="button" disabled={model.busy} onClick={offerBreak}>Take a break</button>}
          {session.planned !== null && <button type="button" disabled={model.busy} onClick={() => send("add")}>+5 min</button>}
          {canSkip && <button type="button" disabled={model.busy} onClick={() => send("skip")}>Skip</button>}
          <button type="button" disabled={model.busy} onClick={() => send("restart")}>Restart</button>
          <button type="button" disabled={model.busy} onClick={() => send("stop")}>Stop</button>
        </div>
      )}
    </section>
  );
}

function Minutes({ label, value, min = 1, max = maxBlockMinutes, set }: {
  label: string; value: number; min?: number; max?: number; set: (value: number) => void;
}) {
  return <label className="field">
    <span>{label}</span>
    <input type="number" min={min} max={max} step={1} required value={Number.isFinite(value) ? value : ""}
      onChange={event => set(event.currentTarget.valueAsNumber)} />
  </label>;
}

function SequenceEditor({ sequence, update }: { sequence: Sequence; update: (sequence: Sequence) => void }) {
  const { blocks } = sequence;

  function change(index: number, edits: Partial<SequenceBlock>) {
    update({ ...sequence, blocks: blocks.map((block, i) => i === index ? { ...block, ...edits } : block) });
  }

  function move(index: number, offset: number) {
    const next = [...blocks];
    const destination = index + offset;
    [next[index], next[destination]] = [next[destination], next[index]];
    update({ ...sequence, blocks: next });
  }

  function add(kind: SequenceBlock["kind"]) {
    update({ ...sequence, blocks: [...blocks, {
      name: kind === "focus" ? "Focus" : "Break", kind, minutes: kind === "focus" ? 25 : 5,
    }] });
  }

  return <>
    <fieldset className="sequence-editor">
      <legend>Sequence blocks</legend>
      <ol className="sequence-blocks">
        {blocks.map((block, index) => (
          <li key={index}>
            <label className="field">
              <span>Block {index + 1} name</span>
              <input value={block.name} required maxLength={60} onChange={event => change(index, { name: event.currentTarget.value })} />
            </label>
            <label className="field">
              <span>Block {index + 1} type</span>
              <select value={block.kind} onChange={event => change(index, { kind: event.currentTarget.value as SequenceBlock["kind"] })}>
                <option value="focus">Focus</option><option value="break">Break</option>
              </select>
            </label>
            <Minutes label={"Block " + (index + 1) + " duration (min)"} value={block.minutes}
              set={minutes => change(index, { minutes })} />
            <div className="controls">
              <button type="button" aria-label={"Move block " + (index + 1) + " up"} disabled={index === 0}
                onClick={() => move(index, -1)}>Move up</button>
              <button type="button" aria-label={"Move block " + (index + 1) + " down"} disabled={index === blocks.length - 1}
                onClick={() => move(index, 1)}>Move down</button>
              <button type="button" aria-label={"Remove block " + (index + 1)} disabled={blocks.length === 1}
                onClick={() => update({ ...sequence, blocks: blocks.filter((_, i) => i !== index) })}>Remove</button>
            </div>
          </li>
        ))}
      </ol>
      <div className="controls">
        <button type="button" onClick={() => add("focus")}>Add focus block</button>
        <button type="button" onClick={() => add("break")}>Add break block</button>
      </div>
    </fieldset>
    <label className="check"><input type="checkbox" checked={sequence.repeat}
      onChange={event => update({ ...sequence, repeat: event.currentTarget.checked })} /> Repeat the sequence</label>
  </>;
}

function PresetSetup({ view, model, onStart }: { view: Workspace; model: Model; onStart: () => void }) {
  const presets = [...builtIns, ...view.presets];
  const [selected, setSelected] = useState(view.lastPreset);
  const [routine, setRoutine] = useState(() => structuredClone(presets.find(p => p.id === view.lastPreset)!.routine));
  const [deleting, confirmDelete] = useState(false);
  const own = view.presets.some(preset => preset.id === selected);
  const { kind } = routine;
  const sequence = routine.sequence ?? sampleSequence;
  const flow = routine.flow ?? defaultFlowBreaks;
  const sequenceOnce = kind === "sequence" && !sequence.repeat;
  const firstBlock = kind === "sequence" ? sequence.blocks[0] : undefined;
  const initial = kind === "stopwatch" || kind === "flowtime" ? 0 : firstBlock?.minutes ?? routine.focus;
  const timed = kind === "intervals" || kind === "countdown";

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

  function changeMode(next: TimerMode) {
    setRoutine(previous => ({
      ...previous,
      kind: next,
      goal: next === "stopwatch" && previous.goal.kind === "rounds" ? { kind: "open" } : previous.goal,
      sequence: previous.sequence ?? structuredClone(sampleSequence),
      flow: previous.flow ?? { ...defaultFlowBreaks },
    }));
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
        <p className="time" aria-label={initial === 0 ? "Starting elapsed time" : "Starting duration"}>
          {Number.isFinite(initial) && initial >= 0 ? clock(initial * minute) : "–:––"}
        </p>
        {kind === "intervals" && <p className="intervals">{routine.focus} min focus · {routine.short} min break</p>}
        {kind === "sequence" && <p className="intervals">{firstBlock?.name || "First block"} · {sequence.blocks.length} blocks · {sequenceOnce ? "One pass" : "Repeat"}</p>}
        {kind === "stopwatch" && <p className="intervals">{routine.goal.kind === "focus" ? routine.goal.amount + " min focus goal" : "Count up"}</p>}
        {kind === "flowtime" && <p className="intervals">Count up and choose when to take a break</p>}
        {kind === "countdown" && (
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
            <select value={kind} onChange={event => changeMode(event.currentTarget.value as TimerMode)}>
              <option value="intervals">Focus and break intervals</option>
              <option value="countdown">Single countdown</option>
              <option value="stopwatch">Stopwatch</option>
              <option value="sequence">Custom sequence</option>
              <option value="flowtime">Flowtime</option>
            </select>
          </label>
          {timed && <Minutes label="Focus (min)" value={routine.focus} set={value => change("focus", value)} />}
          {kind === "intervals" && <>
            <Minutes label="Short break (min)" value={routine.short} set={value => change("short", value)} />
            <Minutes label="Long break every N rounds" min={0} max={99} value={routine.longEvery} set={value => change("longEvery", value)} />
            {routine.longEvery !== 0 && <Minutes label="Long break (min)" value={routine.long} set={value => change("long", value)} />}
          </>}
          {kind === "sequence" && <SequenceEditor sequence={sequence} update={value => change("sequence", value)} />}
          {kind === "flowtime" && (
            <fieldset className="flow-suggestions">
              <legend>Suggested breaks</legend>
              <Minutes label="Up to 25 min of focus" value={flow.upTo25} set={upTo25 => change("flow", { ...flow, upTo25 })} />
              <Minutes label="Over 25 through 50 min" value={flow.upTo50} set={upTo50 => change("flow", { ...flow, upTo50 })} />
              <Minutes label="Over 50 min of focus" value={flow.over50} set={over50 => change("flow", { ...flow, over50 })} />
            </fieldset>
          )}
          {kind !== "countdown" && <>
            <label className="field">
              <span>Session ends</span>
              <select value={routine.goal.kind} onChange={event => changeGoal(event.currentTarget.value as Goal["kind"])}>
                <option value="open">{sequenceOnce ? "At the end of the sequence" : "When I press Stop"}</option>
                {kind !== "stopwatch" && <option value="rounds">After a number of rounds</option>}
                <option value="focus">At a focus-time target</option>
              </select>
            </label>
            {routine.goal.kind === "rounds" && <Minutes label="Focus rounds" value={routine.goal.amount} max={999}
              set={amount => change("goal", { kind: "rounds", amount })} />}
            {routine.goal.kind === "focus" && <Minutes label="Focus target (min)" value={routine.goal.amount} max={1440}
              set={amount => change("goal", { kind: "focus", amount })} />}
          </>}
          {(kind === "intervals" || kind === "sequence") &&
            <label className="check"><input type="checkbox" checked={routine.autoBreak}
              onChange={event => change("autoBreak", event.currentTarget.checked)} /> Start breaks automatically</label>}
          {(kind === "intervals" || kind === "sequence" || kind === "flowtime") &&
            <label className="check"><input type="checkbox" checked={routine.autoFocus}
              onChange={event => change("autoFocus", event.currentTarget.checked)} /> Start focus intervals automatically</label>}
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
