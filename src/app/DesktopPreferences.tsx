import { useLocale } from "./locale";
import { useState, type CSSProperties } from "react";
import { miniColors, type PaletteColors } from "./appearance";
import { cueNames, miniFonts, normalizeShortcut, pulsePeriod, shortcutNames, type AlertStyle,
  type Chime, type Cue, type DesktopSettings as Preferences, type MiniSettings,
  type Placement, type Shortcut } from "./desktopSettings";
import type { useDesktop } from "./useDesktop";
import { Range, Color } from "./SettingsFields";

type Desktop = ReturnType<typeof useDesktop>;

function Check({ label, value, change }: { label: string; value: boolean; change: (value: boolean) => void }) {
  return <label className="setting-row">
    <span>{label}</span>
    <input type="checkbox" checked={value} onChange={event => change(event.currentTarget.checked)} />
  </label>;
}

function Monitor({ desktop, label, selected, change }: {
  desktop: Desktop; label: string; selected: string; change: (id: string) => void;
}) {
  const { t } = useLocale();
  const monitors = desktop.report.displays;
  return <label className="setting-row"><span>{label}</span>
    <select value={selected} onChange={event => change(event.currentTarget.value)}>
      <option value="">{t("Primary display")}</option>
      {selected && !monitors.some(monitor => monitor.id === selected) &&
        <option value={selected}>{t("Saved display (disconnected)")}</option>}
      {monitors.map(({ id, name, primary }) =>
        <option key={id} value={id}>{name}{primary ? " " + t("(primary)") : ""}</option>)}
    </select>
  </label>;
}

function MiniTimerSettings({ desktop, palette }: { desktop: Desktop; palette: PaletteColors }) {
  const { t } = useLocale();
  const mini = desktop.settings.mini;
  const preview = miniColors(mini, palette);
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
      <summary>{t("Mini timer")}</summary>
      <Check label={t("Show mini timer while studying")} value={mini.enabled} change={value => set("enabled", value)} />
      <Monitor desktop={desktop} label={t("Mini timer monitor")} selected={mini.monitor} change={value => set("monitor", value)} />
      <label className="setting-row"><span>{t("Placement")}</span>
        <select value={mini.placement} onChange={event => set("placement", event.currentTarget.value as Placement)}>
          <option value="left">{t("Bottom left")}</option><option value="center">{t("Bottom center")}</option>
          <option value="right">{t("Bottom right")}</option><option value="free">{t("Free position")}</option>
        </select>
      </label>
      <div className="controls desktop-buttons">
        {desktop.report.moving ? (
          <>
            <button type="button" onClick={() => desktop.command("save-move")}>{t("Save position")}</button>
            <button type="button" onClick={() => desktop.command("cancel-move")}>{t("Cancel move")}</button>
          </>
        ) : <button type="button" disabled={!desktop.available} onClick={() => desktop.command("move")}>{t("Move mini timer")}</button>}
      </div>
      {desktop.report.moving && <p className="help">{t("Drag the mini timer to a position, then save it here.")}</p>}
      <Range label={t("Mini timer size")} value={mini.size} min={75} max={160} step={5} suffix="%" change={value => set("size", value)} />
      <Range label={t("Mini timer opacity")} value={mini.opacity} min={35} max={100} step={5} suffix="%" change={value => set("opacity", value)} />
      <Check label={t("Time")} value={mini.showTime} change={value => set("showTime", value)} />
      <Check label={t("Progress")} value={mini.showProgress} change={value => set("showProgress", value)} />
      <Check label={t("Phase label")} value={mini.showPhase} change={value => set("showPhase", value)} />
      <Check label={t("Round count")} value={mini.showRounds} change={value => set("showRounds", value)} />
      {mini.showProgress && <label className="setting-row"><span>{t("Progress style")}</span>
        <select value={mini.progressStyle} onChange={event => set("progressStyle", event.currentTarget.value as MiniSettings["progressStyle"])}>
          <option value="bar">{t("Inset bar")}</option><option value="line">{t("Edge line")}</option>
        </select>
      </label>}
      <label className="setting-row"><span>{t("Mini timer colors")}</span>
        <select value={mini.inheritTheme ? "theme" : "custom"} onChange={event => set("inheritTheme", event.currentTarget.value === "theme")}>
          <option value="theme">{t("Match app theme")}</option><option value="custom">{t("Independent colors")}</option>
        </select>
      </label>
      {!mini.inheritTheme && <>
        <label className="setting-row"><span>{t("Mini timer background style")}</span>
          <select value={mini.backgroundKind} onChange={event => set("backgroundKind", event.currentTarget.value as MiniSettings["backgroundKind"])}>
            <option value="solid">{t("Solid color")}</option><option value="gradient">{t("Gradient")}</option>
          </select>
        </label>
        <Color label={t("Mini timer background")} value={mini.color} change={value => set("color", value)} />
        {mini.backgroundKind === "gradient" && <>
          <Color label={t("Mini timer gradient end")} value={mini.backgroundEnd} change={value => set("backgroundEnd", value)} />
          <label className="setting-row"><span>{t("Gradient direction")}</span>
            <select value={mini.gradientDirection} onChange={event => set("gradientDirection", event.currentTarget.value as MiniSettings["gradientDirection"])}>
              <option value="horizontal">{t("Horizontal")}</option><option value="vertical">{t("Vertical")}</option>
            </select>
          </label>
        </>}
        <Color label={t("Mini timer text")} value={mini.text} change={value => set("text", value)} />
        <Color label={t("Progress color")} value={mini.accent} change={value => set("accent", value)} />
      </>}
      <label className="setting-row"><span>{t("Mini timer font")}</span>
        <select value={mini.font} onChange={event => set("font", event.currentTarget.value as MiniSettings["font"])}>
          {miniFonts.map(font => <option key={font}>{font}</option>)}
        </select>
      </label>
      <Range label={t("Clock text size")} value={mini.clockScale} min={80} max={140} step={5} suffix="%" change={value => set("clockScale", value)} />
      <label className="setting-row"><span>{t("Clock weight")}</span>
        <select value={mini.clockWeight} onChange={event => set("clockWeight", event.currentTarget.value as MiniSettings["clockWeight"])}>
          <option value="regular">{t("Regular")}</option><option value="medium">{t("Semibold")}</option><option value="bold">{t("Bold")}</option>
        </select>
      </label>
      <Range label={t("Corner roundness")} value={mini.roundness} min={0} max={24} change={value => set("roundness", value)} />
      <div className="mini-preview-area" role="img" aria-label={t("Mini timer preview")}>
        <div className="mini-preview" data-progress={mini.progressStyle} style={{
          "--mini-color": preview.color, "--mini-text": preview.text, "--mini-accent": preview.accent,
          "--mini-background": !mini.inheritTheme && mini.backgroundKind === "gradient"
            ? "linear-gradient(to " + (mini.gradientDirection === "vertical" ? "bottom" : "right") + ", "
              + preview.color + ", " + mini.backgroundEnd + ")" : preview.color,
          "--mini-font": '"' + mini.font + '", sans-serif',
          "--clock-scale": mini.clockScale / 100,
          "--clock-weight": { regular: 400, medium: 650, bold: 750 }[mini.clockWeight],
          "--mini-rounding": mini.roundness / 2 + "px",
          "--mini-scale": mini.size / 100, opacity: mini.opacity / 100,
        } as CSSProperties}>
          {mini.showTime && <strong>18:45</strong>}
          {(mini.showPhase || mini.showRounds) && <span>{[mini.showPhase ? t("Focus") : "", mini.showRounds ? t("Round 1") : ""].filter(Boolean).join(" · ")}</span>}
          {mini.showProgress && <div className="mini-preview-track" />}
        </div>
      </div>
    </details>
  );
}

function AlertSettings({ desktop }: { desktop: Desktop }) {
  const { t } = useLocale();
  const [selected, choose] = useState<Cue>("focus-ended");
  const data = desktop.settings;
  const cue = data.cues[selected];
  const update = <K extends keyof typeof cue>(key: K, value: (typeof cue)[K]) =>
    void desktop.change(prefs => { prefs.cues[selected][key] = value; });

  return (
    <details className="panel edit desktop-settings">
      <summary>{t("Alerts and sound")}</summary>
      <label className="setting-row"><span>{t("Alert display")}</span>
        <select value={data.target} onChange={event => {
          const value = event.currentTarget.value as Preferences["target"];
          void desktop.change(prefs => { prefs.target = value; });
        }}>
          <option value="all">{t("All monitors")}</option><option value="selected">{t("Selected monitor")}</option>
          <option value="mini">{t("Mini timer only")}</option>
        </select>
      </label>
      {data.target === "selected" && <Monitor desktop={desktop} label={t("Alert monitor")} selected={data.alertMonitor}
        change={value => void desktop.change(prefs => { prefs.alertMonitor = value; })} />}
      <Check label={t("Alert when I press Stop")} value={data.alertOnStop}
        change={value => void desktop.change(prefs => { prefs.alertOnStop = value; })} />
      <Check label={t("Play alert sounds")} value={data.sound}
        change={value => void desktop.change(prefs => { prefs.sound = value; })} />
      <Range label={t("Alert volume")} value={data.volume} min={0} max={100} step={5} suffix="%"
        change={value => void desktop.change(prefs => { prefs.volume = value; })} />
      <label className="setting-row"><span>{t("Event")}</span>
        <select value={selected} onChange={event => choose(event.currentTarget.value as Cue)}>
          {(Object.entries(cueNames) as [Cue, string][]).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
        </select>
      </label>
      <Check label={t("Visual alert")} value={cue.enabled} change={value => update("enabled", value)} />
      <label className="setting-row"><span>{t("Visual style")}</span>
        <select value={cue.style} onChange={event => update("style", event.currentTarget.value as AlertStyle)}>
          <option value="fade">{t("Screen fade")}</option><option value="edge">{t("Edge glow")}</option><option value="static">{t("Static tint")}</option>
        </select>
      </label>
      <Color label={t("Alert color")} value={cue.color} change={value => update("color", value)} />
      <Range label={t("Peak opacity")} value={cue.opacity} min={5} max={55} suffix="%" change={value => update("opacity", value)} />
      <Range label={t("Fade duration")} value={cue.fadeMs} min={250} max={2500} step={50} suffix=" ms"
        change={value => update("fadeMs", value)} />
      <Range label={t("Time between pulses")} value={cue.gapMs} min={0} max={5000} step={50} suffix=" ms"
        change={value => update("gapMs", value)} />
      <Check label={t("Repeat until dismissed")} value={cue.repeat} change={value => update("repeat", value)} />
      {!cue.repeat && <Range label={t("Pulse count")} value={cue.count} min={1} max={6} change={value => update("count", value)} />}
      <p className="help">{t("Pulse cycle")}{(pulsePeriod(cue.fadeMs, cue.gapMs) / 1000).toFixed(2)}{t("s")}</p>
      <label className="setting-row"><span>{t("Chime")}</span>
        <select value={cue.chime} onChange={event => update("chime", event.currentTarget.value as Chime)}>
          <option value="none">{t("None")}</option><option value="low">{t("Low")}</option><option value="bright">{t("Bright")}</option>
          <option value="double">{t("Two notes")}</option>
        </select>
      </label>
      <div className="controls desktop-buttons">
        <button type="button" disabled={!desktop.available} onClick={() => desktop.preview(selected)}>{t("Preview visual")}</button>
        <button type="button" disabled={!desktop.available || cue.chime === "none"}
          onClick={() => desktop.preview(selected, true)}>{t("Preview sound")}</button>
        <button type="button" disabled={!desktop.available} onClick={() => desktop.command("dismiss")}>{t("Stop preview / dismiss")}</button>
      </div>
    </details>
  );
}

function ShortcutEditor({ desktop, action, status }: { desktop: Desktop; action: Shortcut; status?: string | null }) {
  const { t } = useLocale();
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
        <span>{t(shortcutNames[action])}</span>
        <input type="text" value={input} placeholder={t("Disabled")} maxLength={25} onChange={event => change(event.currentTarget.value)}
          onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); save(); } }} />
      </label>
      <div className="controls desktop-buttons">
        <button type="button" onClick={save}>{t("Save shortcut")}</button>
        <button type="button" onClick={() => {
          void desktop.change(prefs => { prefs.shortcuts[action] = ""; }).then(ok => {
            if (ok) { change(""); setError(""); }
          });
        }}>{t("Disable")}</button>
      </div>
      {(error || status) && <p className="help" role="status">
        {error ? t(error) : t("{chord} is unavailable in Windows.", { chord: status ?? "" })}
      </p>}
    </div>
  );
}

export function DesktopPreferences({ desktop, palette }: { desktop: Desktop; palette: PaletteColors }) {
  const { t } = useLocale();
  return (
    <>
      <MiniTimerSettings desktop={desktop} palette={palette} />
      <AlertSettings desktop={desktop} />
      <details className="panel edit desktop-settings">
        <summary>{t("Global shortcuts")}</summary>
        {(Object.keys(shortcutNames) as Shortcut[]).map((action, index) => (
          <ShortcutEditor key={action} desktop={desktop} action={action} status={desktop.report.shortcutErrors[index]} />
        ))}
      </details>
    </>
  );
}
