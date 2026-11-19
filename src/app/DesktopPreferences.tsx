import { useState } from "react";
import { cueNames, normalizeShortcut, pulsePeriod, shortcutNames, type AlertStyle,
  type Chime, type Cue, type DesktopSettings as Preferences, type MiniSettings,
  type Placement, type Shortcut } from "./desktopSettings";
import type { useDesktop } from "./useDesktop";

type Desktop = ReturnType<typeof useDesktop>;

function Range({ label, value, min, max, step = 1, suffix, change }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; change: (value: number) => void;
}) {
  return <label className="setting-row">
    <span>{label}</span>
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={event => change(event.currentTarget.valueAsNumber)} />
      <output>{value}{suffix}</output>
    </div>
  </label>;
}

function Color({ label, value, change }: { label: string; value: string; change: (value: string) => void }) {
  return <label className="setting-row">
    <span>{label}</span>
    <input type="color" value={value} onChange={event => change(event.currentTarget.value)} />
  </label>;
}

function Check({ label, value, change }: { label: string; value: boolean; change: (value: boolean) => void }) {
  return <label className="setting-row">
    <span>{label}</span>
    <input type="checkbox" checked={value} onChange={event => change(event.currentTarget.checked)} />
  </label>;
}

function Monitor({ desktop, label, selected, change }: {
  desktop: Desktop; label: string; selected: string; change: (id: string) => void;
}) {
  const monitors = desktop.report.displays;
  return <label className="setting-row"><span>{label}</span>
    <select value={selected} onChange={event => change(event.currentTarget.value)}>
      <option value="">Primary display</option>
      {selected && !monitors.some(monitor => monitor.id === selected) &&
        <option value={selected}>Saved display (disconnected)</option>}
      {monitors.map(({ id, name, primary }) =>
        <option key={id} value={id}>{name}{primary ? " (primary)" : ""}</option>)}
    </select>
  </label>;
}

function MiniTimerSettings({ desktop }: { desktop: Desktop }) {
  const mini = desktop.settings.mini;
  const set = <K extends keyof MiniSettings>(key: K, value: MiniSettings[K]) => {
    void desktop.change(prefs => {
      prefs.mini[key] = value;
      if (!prefs.mini.showTime && !prefs.mini.showProgress && !prefs.mini.showPhase && !prefs.mini.showRounds) {
        prefs.mini.showTime = true;
      }
    });
  };
  return (
    <details className="panel edit desktop-settings">
      <summary>Mini timer</summary>
      <Check label="Show mini timer while studying" value={mini.enabled} change={value => set("enabled", value)} />
      <Monitor desktop={desktop} label="Mini timer monitor" selected={mini.monitor} change={value => set("monitor", value)} />
      <label className="setting-row"><span>Placement</span>
        <select value={mini.placement} onChange={event => set("placement", event.currentTarget.value as Placement)}>
          <option value="left">Bottom left</option><option value="center">Bottom center</option>
          <option value="right">Bottom right</option><option value="free">Free position</option>
        </select>
      </label>
      <div className="controls desktop-buttons">
        {desktop.report.moving ? (
          <>
            <button type="button" onClick={() => desktop.command("save-move")}>Save position</button>
            <button type="button" onClick={() => desktop.command("cancel-move")}>Cancel move</button>
          </>
        ) : <button type="button" disabled={!desktop.available} onClick={() => desktop.command("move")}>Move mini timer</button>}
      </div>
      {desktop.report.moving && <p className="help">Drag the mini timer to a position, then save it here.</p>}
      <Range label="Mini timer size" value={mini.size} min={75} max={160} step={5} suffix="%" change={value => set("size", value)} />
      <Range label="Mini timer opacity" value={mini.opacity} min={35} max={100} step={5} suffix="%" change={value => set("opacity", value)} />
      <Check label="Time" value={mini.showTime} change={value => set("showTime", value)} />
      <Check label="Progress" value={mini.showProgress} change={value => set("showProgress", value)} />
      <Check label="Phase label" value={mini.showPhase} change={value => set("showPhase", value)} />
      <Check label="Round count" value={mini.showRounds} change={value => set("showRounds", value)} />
      {mini.showProgress && <label className="setting-row"><span>Progress style</span>
        <select value={mini.progressStyle} onChange={event => set("progressStyle", event.currentTarget.value as MiniSettings["progressStyle"])}>
          <option value="bar">Inset bar</option><option value="line">Edge line</option>
        </select>
      </label>}
      <Color label="Mini timer background" value={mini.color} change={value => set("color", value)} />
      <Color label="Mini timer text" value={mini.text} change={value => set("text", value)} />
      <Color label="Progress color" value={mini.accent} change={value => set("accent", value)} />
    </details>
  );
}

function AlertSettings({ desktop }: { desktop: Desktop }) {
  const [selected, choose] = useState<Cue>("focus-ended");
  const data = desktop.settings;
  const cue = data.cues[selected];
  const update = <K extends keyof typeof cue>(key: K, value: (typeof cue)[K]) =>
    void desktop.change(prefs => { prefs.cues[selected][key] = value; });

  return (
    <details className="panel edit desktop-settings">
      <summary>Alerts and sound</summary>
      <label className="setting-row"><span>Alert display</span>
        <select value={data.target} onChange={event => {
          const value = event.currentTarget.value as Preferences["target"];
          void desktop.change(prefs => { prefs.target = value; });
        }}>
          <option value="all">All monitors</option><option value="selected">Selected monitor</option>
          <option value="mini">Mini timer only</option>
        </select>
      </label>
      {data.target === "selected" && <Monitor desktop={desktop} label="Alert monitor" selected={data.alertMonitor}
        change={value => void desktop.change(prefs => { prefs.alertMonitor = value; })} />}
      <Check label="Alert when I press Stop" value={data.alertOnStop}
        change={value => void desktop.change(prefs => { prefs.alertOnStop = value; })} />
      <Check label="Play alert sounds" value={data.sound}
        change={value => void desktop.change(prefs => { prefs.sound = value; })} />
      <Range label="Alert volume" value={data.volume} min={0} max={100} step={5} suffix="%"
        change={value => void desktop.change(prefs => { prefs.volume = value; })} />
      <label className="setting-row"><span>Event</span>
        <select value={selected} onChange={event => choose(event.currentTarget.value as Cue)}>
          {(Object.entries(cueNames) as [Cue, string][]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <Check label="Visual alert" value={cue.enabled} change={value => update("enabled", value)} />
      <label className="setting-row"><span>Visual style</span>
        <select value={cue.style} onChange={event => update("style", event.currentTarget.value as AlertStyle)}>
          <option value="fade">Screen fade</option><option value="edge">Edge glow</option><option value="static">Static tint</option>
        </select>
      </label>
      <Color label="Alert color" value={cue.color} change={value => update("color", value)} />
      <Range label="Peak opacity" value={cue.opacity} min={5} max={55} suffix="%" change={value => update("opacity", value)} />
      <Range label="Fade duration" value={cue.fadeMs} min={250} max={2500} step={50} suffix=" ms"
        change={value => update("fadeMs", value)} />
      <Range label="Time between pulses" value={cue.gapMs} min={0} max={5000} step={50} suffix=" ms"
        change={value => update("gapMs", value)} />
      <Check label="Repeat until dismissed" value={cue.repeat} change={value => update("repeat", value)} />
      {!cue.repeat && <Range label="Pulse count" value={cue.count} min={1} max={6} change={value => update("count", value)} />}
      <p className="help">Pulse cycle {(pulsePeriod(cue.fadeMs, cue.gapMs) / 1000).toFixed(2)} s</p>
      <label className="setting-row"><span>Chime</span>
        <select value={cue.chime} onChange={event => update("chime", event.currentTarget.value as Chime)}>
          <option value="none">None</option><option value="low">Low</option><option value="bright">Bright</option>
          <option value="double">Two notes</option>
        </select>
      </label>
      <div className="controls desktop-buttons">
        <button type="button" disabled={!desktop.available} onClick={() => desktop.preview(selected)}>Preview visual</button>
        <button type="button" disabled={!desktop.available || cue.chime === "none"}
          onClick={() => desktop.preview(selected, true)}>Preview sound</button>
        <button type="button" disabled={!desktop.available} onClick={() => desktop.command("dismiss")}>Stop preview / dismiss</button>
      </div>
    </details>
  );
}

function ShortcutEditor({ desktop, action, status }: { desktop: Desktop; action: Shortcut; status?: string | null }) {
  const shortcut = desktop.settings.shortcuts[action];
  const [input, change] = useState(shortcut);
  const [error, setError] = useState("");
  const save = () => {
    try {
      const clean = normalizeShortcut(input);
      void desktop.change(prefs => { prefs.shortcuts[action] = clean; }).then(ok => {
        if (ok) {
          change(clean);
          setError("");
        }
      });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  };
  return (
    <div className="shortcut-editor">
      <label className="setting-row">
        <span>{shortcutNames[action]}</span>
        <input type="text" value={input} placeholder="Disabled" maxLength={25} onChange={event => change(event.currentTarget.value)}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); save(); } }} />
      </label>
      <div className="controls desktop-buttons">
        <button type="button" onClick={save}>Save shortcut</button>
        <button type="button" onClick={() => {
          void desktop.change(prefs => { prefs.shortcuts[action] = ""; }).then(ok => {
            if (ok) { change(""); setError(""); }
          });
        }}>Disable</button>
      </div>
      {(error || status) && <p className="help" role="status">{error || status}</p>}
    </div>
  );
}

export function DesktopPreferences({ desktop }: { desktop: Desktop }) {
  return (
    <>
      <MiniTimerSettings desktop={desktop} />
      <AlertSettings desktop={desktop} />
      <details className="panel edit desktop-settings">
        <summary>Global shortcuts</summary>
        {(Object.keys(shortcutNames) as Shortcut[]).map((action, index) => (
          <ShortcutEditor key={action} desktop={desktop} action={action} status={desktop.report.shortcutErrors[index]} />
        ))}
      </details>
    </>
  );
}
