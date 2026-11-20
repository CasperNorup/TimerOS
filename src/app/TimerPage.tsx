import { useLocale } from "./locale";
import { useState } from "react";
import { act, builtIns, defaultFlowBreaks, deletePreset, displayTime, maxBlockMinutes, minute,
  sampleSequence, savePreset, startSession, suggestFlowBreak, takeFlowBreak,
  type Goal, type Routine, type Sequence, type SequenceBlock, type Session, type TimerAction, type TimerMode,
  type Workspace } from "./timer";
import type { useTimer } from "./useTimer";
import { formatClock as clock, sessionPhase } from "./useDesktop";

type Model = ReturnType<typeof useTimer>;
type BreakChoice = { suggested: number; minutes: number; resumeOnCancel: boolean };

function SessionCard({ session, model }: { session: Session; model: Model }) {
  const { t } = useLocale();
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
    <section className="panel timer" aria-label={t("Current session")}>
      <h2>{session.builtInName ? t(session.routine.name) : session.routine.name}</h2>
      <p className="phase">{sessionPhase(session, t)}</p>
      <p className="time" aria-label={t(reading.countUp ? "Time elapsed" : "Time remaining")}>
        {clock(reading.countUp ? reading.elapsed : reading.remaining ?? 0, reading.countUp)}
      </p>
      {reading.progress !== null && <progress max={1} value={reading.progress}
        aria-label={t(reading.countUp ? "Focus goal progress" : "Interval progress")} />}
      {(session.routine.kind !== "countdown" && session.routine.kind !== "stopwatch" || focusGoal) && (
        <p className="intervals">
          {session.routine.kind === "sequence" && t("Block {number} of {total}", {
            number: (session.step ?? 0) + 1, total: session.routine.sequence!.blocks.length,
          }) + " · "}
          {session.routine.kind !== "stopwatch" && t(session.rounds === 1 ? "{count} round completed" : "{count} rounds completed", { count: session.rounds })}
          {focusGoal && (session.routine.kind !== "stopwatch" ? " · " : "") + t("{time} focus", { time: clock(reading.focusTotal, true) })}
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
            <p className="intervals">{t("This focus block completes your round goal.")}</p>
          ) : (
            <>
              <p className="intervals">{t("Suggested break · {minutes} min", { minutes: editingBreak.suggested })}</p>
              <Minutes label={t("Break duration (min)")} value={editingBreak.minutes}
                set={minutes => setChoice({ ...editingBreak, minutes })} />
            </>
          )}
          <div className="controls">
            <button type="submit" className="primary" disabled={model.busy}>
              {t(session.routine.goal.kind === "rounds" && session.rounds + 1 >= session.routine.goal.amount
                ? "Finish session" : "Start break")}
            </button>
            <button type="button" disabled={model.busy} onClick={() => {
              if (editingBreak.resumeOnCancel) {
                void model.update((state, time) => act(state, "resume", time)).then(ok => { if (ok) setChoice(null); });
              } else setChoice(null);
            }}>{t("Cancel")}</button>
            <button type="button" disabled={model.busy} onClick={() => send("stop")}>{t("Stop")}</button>
          </div>
        </form>
      ) : (
        <div className="controls">
          <button className={flowFocus ? undefined : "primary"} type="button" disabled={model.busy}
            onClick={() => send(primary)}>{t(mainLabel)}</button>
          {flowFocus && <button className="primary" type="button" disabled={model.busy} onClick={offerBreak}>{t("Take a break")}</button>}
          {session.planned !== null && <button type="button" disabled={model.busy} onClick={() => send("add")}>{t("+5 min")}</button>}
          {canSkip && <button type="button" disabled={model.busy} onClick={() => send("skip")}>{t("Skip")}</button>}
          <button type="button" disabled={model.busy} onClick={() => send("restart")}>{t("Restart")}</button>
          <button type="button" disabled={model.busy} onClick={() => send("stop")}>{t("Stop")}</button>
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
  const { t } = useLocale();
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
      name: t(kind === "focus" ? "Focus" : "Break"), kind, minutes: kind === "focus" ? 25 : 5,
    }] });
  }

  return <>
    <fieldset className="sequence-editor">
      <legend>{t("Sequence blocks")}</legend>
      <ol className="sequence-blocks">
        {blocks.map((block, index) => (
          <li key={index}>
            <label className="field">
              <span>{t("Block {number} name", { number: index + 1 })}</span>
              <input value={block.name} required maxLength={60} onChange={event => change(index, { name: event.currentTarget.value })} />
            </label>
            <label className="field">
              <span>{t("Block {number} type", { number: index + 1 })}</span>
              <select value={block.kind} onChange={event => change(index, { kind: event.currentTarget.value as SequenceBlock["kind"] })}>
                <option value="focus">{t("Focus")}</option><option value="break">{t("Break")}</option>
              </select>
            </label>
            <Minutes label={t("Block {number} duration (min)", { number: index + 1 })} value={block.minutes}
              set={minutes => change(index, { minutes })} />
            <div className="controls">
              <button type="button" aria-label={t("Move block {number} up", { number: index + 1 })} disabled={index === 0}
                onClick={() => move(index, -1)}>{t("Move up")}</button>
              <button type="button" aria-label={t("Move block {number} down", { number: index + 1 })} disabled={index === blocks.length - 1}
                onClick={() => move(index, 1)}>{t("Move down")}</button>
              <button type="button" aria-label={t("Remove block {number}", { number: index + 1 })} disabled={blocks.length === 1}
                onClick={() => update({ ...sequence, blocks: blocks.filter((_, i) => i !== index) })}>{t("Remove")}</button>
            </div>
          </li>
        ))}
      </ol>
      <div className="controls">
        <button type="button" onClick={() => add("focus")}>{t("Add focus block")}</button>
        <button type="button" onClick={() => add("break")}>{t("Add break block")}</button>
      </div>
    </fieldset>
    <label className="check"><input type="checkbox" checked={sequence.repeat}
      onChange={event => update({ ...sequence, repeat: event.currentTarget.checked })} />{t("Repeat the sequence")}</label>
  </>;
}

function PresetSetup({ view, model, onStart }: { view: Workspace; model: Model; onStart: () => void }) {
  const { t } = useLocale();
  const presets = [...builtIns, ...view.presets];
  const [selected, setSelected] = useState(view.lastPreset);
  const [routine, setRoutine] = useState(() => structuredClone(presets.find(p => p.id === view.lastPreset)!.routine));
  const [deleting, confirmDelete] = useState(false);
  const [subject, setSubject] = useState("");
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
    const saved = copy ? { ...routine, name: t("{name} copy", { name: routine.name.trim().slice(0, 50) }) } : routine;
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
      void model.update((state, time) => startSession(state, routine, selected, time, subject)).then(ok => { if (ok) onStart(); });
    }}>
      {view.result && (
        <p className="result" role="status">
          {t(view.result.reason === "finished" ? "Session complete" : "Session stopped")} · {t("{time} focus", { time: clock(view.result.focusTime) })}</p>
      )}
      <section className="panel timer" aria-label={t("Timer setup")}>
        <label className="field">
          <span>{t("Preset")}</span>
          <select value={selected} onChange={event => choose(event.currentTarget.value)}>
            <optgroup label={t("Built-in presets")}>
              {builtIns.map(p => <option key={p.id} value={p.id}>{t(p.routine.name)}</option>)}
            </optgroup>
            {view.presets.length > 0 && <optgroup label={t("My presets")}>
              {view.presets.map(p => <option key={p.id} value={p.id}>{p.routine.name}</option>)}
            </optgroup>}
          </select>
        </label>
        <p className="time" aria-label={t(initial === 0 ? "Starting elapsed time" : "Starting duration")}>
          {Number.isFinite(initial) && initial >= 0 ? clock(initial * minute) : "–:––"}
        </p>
        {kind === "intervals" && <p className="intervals">{t("{focus} min focus · {rest} min break", { focus: routine.focus, rest: routine.short })}</p>}
        {kind === "sequence" && <p className="intervals">{firstBlock?.name || t("First block")} · {t("{count} blocks", { count: sequence.blocks.length })} · {t(sequenceOnce ? "One pass" : "Repeat")}</p>}
        {kind === "stopwatch" && <p className="intervals">{routine.goal.kind === "focus"
          ? t("{minutes} min focus goal", { minutes: routine.goal.amount }) : t("Count up")}</p>}
        {kind === "flowtime" && <p className="intervals">{t("Count up and choose when to take a break")}</p>}
        {kind === "countdown" && (
          <div className="controls" aria-label={t("Quick countdown durations")}>
            {[5, 15, 25, 45].map(value => (
              <button key={value} type="button" aria-pressed={value === routine.focus} onClick={() => change("focus", value)}>
                {t("{minutes} min", { minutes: value })}</button>
            ))}
          </div>
        )}
        {view.history.enabled && <label className="field subject-field"><span>{t("Study subject (optional)")}</span>
          <input type="text" value={subject} maxLength={60} onChange={event => setSubject(event.currentTarget.value)} />
        </label>}
        <div className="controls">
          <button className="primary" type="submit" disabled={model.busy}>{t("Start")}</button>
        </div>
      </section>
      <details className="panel edit">
        <summary>{t("Customize session or preset")}</summary>
        <div className="edit-fields">
          <label className="field">
            <span>{t("Preset name")}</span>
            <input value={routine.name} maxLength={60} required onChange={event => change("name", event.currentTarget.value)} />
          </label>
          <label className="field">
            <span>{t("Timer mode")}</span>
            <select value={kind} onChange={event => changeMode(event.currentTarget.value as TimerMode)}>
              <option value="intervals">{t("Focus and break intervals")}</option>
              <option value="countdown">{t("Single countdown")}</option>
              <option value="stopwatch">{t("Stopwatch")}</option>
              <option value="sequence">{t("Custom sequence")}</option>
              <option value="flowtime">{t("Flowtime")}</option>
            </select>
          </label>
          {timed && <Minutes label={t("Focus (min)")} value={routine.focus} set={value => change("focus", value)} />}
          {kind === "intervals" && <>
            <Minutes label={t("Short break (min)")} value={routine.short} set={value => change("short", value)} />
            <Minutes label={t("Long break every N rounds")} min={0} max={99} value={routine.longEvery} set={value => change("longEvery", value)} />
            {routine.longEvery !== 0 && <Minutes label={t("Long break (min)")} value={routine.long} set={value => change("long", value)} />}
          </>}
          {kind === "sequence" && <SequenceEditor sequence={sequence} update={value => change("sequence", value)} />}
          {kind === "flowtime" && (
            <fieldset className="flow-suggestions">
              <legend>{t("Suggested breaks")}</legend>
              <Minutes label={t("Up to 25 min of focus")} value={flow.upTo25} set={upTo25 => change("flow", { ...flow, upTo25 })} />
              <Minutes label={t("Over 25 through 50 min")} value={flow.upTo50} set={upTo50 => change("flow", { ...flow, upTo50 })} />
              <Minutes label={t("Over 50 min of focus")} value={flow.over50} set={over50 => change("flow", { ...flow, over50 })} />
            </fieldset>
          )}
          {kind !== "countdown" && <>
            <label className="field">
              <span>{t("Session ends")}</span>
              <select value={routine.goal.kind} onChange={event => changeGoal(event.currentTarget.value as Goal["kind"])}>
                <option value="open">{t(sequenceOnce ? "At the end of the sequence" : "When I press Stop")}</option>
                {kind !== "stopwatch" && <option value="rounds">{t("After a number of rounds")}</option>}
                <option value="focus">{t("At a focus-time target")}</option>
              </select>
            </label>
            {routine.goal.kind === "rounds" && <Minutes label={t("Focus rounds")} value={routine.goal.amount} max={999}
              set={amount => change("goal", { kind: "rounds", amount })} />}
            {routine.goal.kind === "focus" && <Minutes label={t("Focus target (min)")} value={routine.goal.amount} max={1440}
              set={amount => change("goal", { kind: "focus", amount })} />}
          </>}
          {(kind === "intervals" || kind === "sequence") &&
            <label className="check"><input type="checkbox" checked={routine.autoBreak}
              onChange={event => change("autoBreak", event.currentTarget.checked)} />{t("Start breaks automatically")}</label>}
          {(kind === "intervals" || kind === "sequence" || kind === "flowtime") &&
            <label className="check"><input type="checkbox" checked={routine.autoFocus}
              onChange={event => change("autoFocus", event.currentTarget.checked)} />{t("Start focus intervals automatically")}</label>}
        </div>
        <div className="controls preset-controls">
          {own && <button type="button" disabled={model.busy} onClick={() => store(true)}>{t("Save preset")}</button>}
          <button type="button" disabled={model.busy} onClick={() => store(false)}>{t("Save as new preset")}</button>
          <button type="button" disabled={model.busy} onClick={() => store(false, true)}>{t("Duplicate")}</button>
          {own && !deleting && <button type="button" disabled={model.busy} onClick={() => confirmDelete(true)}>{t("Delete")}</button>}
        </div>
        {deleting && (
          <div className="delete-preset">
            <p>{t("Delete this preset?")}</p>
            <div className="controls">
              <button type="button" onClick={() => confirmDelete(false)}>{t("Cancel")}</button>
              <button type="button" disabled={model.busy} onClick={remove}>{t("Delete preset")}</button>
            </div>
          </div>
        )}
      </details>
    </form>
  );
}

export function TimerPage({ model, onStart }: { model: Model; onStart: () => void }) {
  const { t } = useLocale();
  return (
    <>
      <h1 id="timer-title">{t("Timer")}</h1>
      {model.view?.session && <SessionCard session={model.view.session} model={model} />}
      {model.view && !model.view.session && <PresetSetup view={model.view} model={model} onStart={onStart} />}
    </>
  );
}
