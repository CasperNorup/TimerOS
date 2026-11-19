import { useLocale } from "./locale";
import { useState, type CSSProperties } from "react";
import { activeTheme, builtInThemes, bundledImages, densities, displayModes, fonts, newAppearance,
  paletteColors, paletteTokens, splashChoices, type Appearance, type Background, type PaletteColors,
  type Theme, type Variant } from "./appearance";
import { removeBackground, saveBackground } from "./appearanceImages";
import { Color, Range } from "./SettingsFields";

type Change = (apply: (appearance: Appearance) => void) => Promise<boolean>;

function Select<T extends string>({ label, value, options, change }: {
  label: string; value: T; options: readonly T[]; change: (value: T) => void;
}) {
  const { t } = useLocale();
  return <label className="setting-row"><span>{label}</span>
    <select value={value} onChange={event => change(event.currentTarget.value as T)}>
      {options.map(option => <option key={option} value={option}>{t(option)}</option>)}
    </select>
  </label>;
}

function ThemeEditor({ theme, change, currentVariant }: { theme: Theme; change: Change; currentVariant: Variant }) {
  const { t } = useLocale();
  const [variant, setVariant] = useState(currentVariant);
  const [name, setName] = useState(theme.name);
  const [confirm, setConfirm] = useState(false);

  function edit(update: (theme: Theme) => void) {
    void change(appearance => {
      const custom = appearance.palettes.find(candidate => candidate.id === theme.id);
      if (custom) update(custom);
    });
  }

  return <>
    <form className="theme-name" onSubmit={event => {
      event.preventDefault();
      if (name.trim()) edit(theme => { theme.name = name.trim(); });
    }}>
      <label className="field"><span>{t("Theme name")}</span>
        <input type="text" value={name} required maxLength={60} onChange={event => setName(event.currentTarget.value)} />
      </label>
      <div className="controls"><button type="submit" disabled={!name.trim() || name.trim() === theme.name}>{t("Save theme name")}</button></div>
    </form>
    <label className="setting-row"><span>{t("Palette variant")}</span>
      <select value={variant} onChange={event => setVariant(event.currentTarget.value as Variant)}>
        <option value="light">{t("Light")}</option><option value="dark">{t("Dark")}</option>
      </select>
    </label>
    {(Object.entries(paletteColors) as [keyof PaletteColors, string][]).map(([key, label]) =>
      <Color key={variant + key} label={t(label)} value={theme[variant][key]}
        change={value => edit(theme => { theme[variant][key] = value; })} />)}
    <div className="palette-preview" aria-label={t("Palette preview")} role="img"
      style={paletteTokens(theme[variant]) as CSSProperties}>
      <div><span className="preview-accent">{t("Focus")}</span><span>25:00</span></div>
    </div>
    <div className="controls desktop-buttons">
      {confirm ? <>
        <button type="button" onClick={() => void change(appearance => {
          appearance.palettes = appearance.palettes.filter(candidate => candidate.id !== theme.id);
          appearance.theme = "blue";
        })}>{t("Delete this theme")}</button>
        <button type="button" onClick={() => setConfirm(false)}>{t("Cancel")}</button>
      </> : <button type="button" onClick={() => setConfirm(true)}>{t("Delete theme")}</button>}
    </div>
  </>;
}

function ThemeSettings({ appearance, variant, change }: { appearance: Appearance; variant: Variant; change: Change }) {
  const { t } = useLocale();
  const current = activeTheme(appearance);
  const themes = [...builtInThemes, ...appearance.palettes];
  const personal = appearance.palettes.some(theme => theme.id === current.id);
  function create(copy: boolean) {
    const template = copy ? current : builtInThemes[0];
    const theme = { ...structuredClone(template), id: "custom-" + crypto.randomUUID(),
      name: copy ? t("{name} copy", { name: template.name.slice(0, 50) }) : t("New theme") };
    void change(appearance => {
      appearance.palettes.push(theme);
      appearance.theme = theme.id;
    });
  }
  return <details className="appearance-group">
    <summary>{t("Themes and palettes")}</summary>
    <label className="setting-row"><span>{t("Theme")}</span>
      <select value={appearance.theme} onChange={event => {
        const next = event.currentTarget.value;
        void change(appearance => { appearance.theme = next; });
      }}>
        {themes.map(theme => <option key={theme.id} value={theme.id}>{theme.id.startsWith("custom-") ? theme.name : t(theme.name)}</option>)}
      </select>
    </label>
    <div className="controls desktop-buttons">
      <button type="button" onClick={() => create(false)}>{t("New theme")}</button>
      <button type="button" onClick={() => create(true)}>{t("Duplicate theme")}</button>
    </div>
    {personal && <ThemeEditor key={current.id} theme={current} change={change} currentVariant={variant} />}
  </details>;
}

function BackgroundSettings({ background, missing, change }: { background: Background; missing: boolean; change: Change }) {
  const { t } = useLocale();
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const image = background.kind === "bundled" || background.kind === "local";
  function set<K extends keyof Background>(key: K, value: Background[K]) {
    void change(appearance => { appearance.background[key] = value; });
  }
  async function importImage(file: File) {
    setError("");
    setImporting(true);
    try {
      const next = await saveBackground(file);
      let previous: Background["local"] = null;
      const saved = await change(appearance => {
        previous = appearance.background.local;
        appearance.background.local = next;
      });
      const discard: Background["local"] = saved ? previous : next;
      if (discard) void removeBackground(discard.id).catch(() => {});
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "The image could not be saved on this device.");
    } finally {
      setImporting(false);
    }
  }

  return <details className="appearance-group">
    <summary>{t("Background")}</summary>
    <label className="setting-row"><span>{t("Background type")}</span>
      <select value={background.kind} onChange={event => set("kind", event.currentTarget.value as Background["kind"])}>
        <option value="theme">{t("Theme background")}</option><option value="solid">{t("Solid color")}</option>
        <option value="gradient">{t("Gradient")}</option><option value="bundled">{t("Bundled image")}</option>
        <option value="local">{t("Local image")}</option>
      </select>
    </label>
    {background.kind === "solid" && <Color label={t("Background color")} value={background.color} change={value => set("color", value)} />}
    {background.kind === "gradient" && <>
      <Color label={t("Start color")} value={background.color} change={value => set("color", value)} />
      <Color label={t("End color")} value={background.end} change={value => set("end", value)} />
      <Range label={t("Gradient angle")} min={0} max={360} suffix="°" value={background.angle} change={value => set("angle", value)} />
    </>}
    {background.kind === "bundled" && <label className="setting-row"><span>{t("Bundled image")}</span>
      <select value={background.bundled} onChange={event => set("bundled", event.currentTarget.value as Background["bundled"])}>
        {Object.entries(bundledImages).map(([id, name]) => <option key={id} value={id}>{t(name)}</option>)}
      </select>
    </label>}
    {background.kind === "local" && <>
      <label className="field local-background"><span>{t("Choose local image")}</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={importing} onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void importImage(file);
        }} />
      </label>
      {importing && <p className="help" role="status">{t("Saving image…")}</p>}
      {background.local && <p className="help background-name">{background.local.name}</p>}
      {missing && <p className="help" role="status">{t("The saved image is unavailable. Choose another image to replace it.")}</p>}
      {error && <p className="help" role="alert">{t(error)}</p>}
    </>}
    {image && <>
      <label className="setting-row"><span>{t("Image fit")}</span>
        <select value={background.fit} onChange={event => set("fit", event.currentTarget.value as Background["fit"])}>
          <option value="cover">{t("Fill window")}</option><option value="contain">{t("Fit whole image")}</option>
        </select>
      </label>
      <Range label={t("Horizontal position")} min={0} max={100} suffix="%" value={background.x} change={value => set("x", value)} />
      <Range label={t("Vertical position")} min={0} max={100} suffix="%" value={background.y} change={value => set("y", value)} />
    </>}
  </details>;
}

export function AppearancePreferences({ appearance, variant, missingImage, change }: {
  appearance: Appearance; variant: Variant; missingImage: boolean; change: Change;
}) {
  const { t } = useLocale();
  function set<K extends keyof Appearance>(key: K, value: Appearance[K]) {
    void change(appearance => { appearance[key] = value; });
  }

  return <section className="panel settings appearance-settings" aria-labelledby="appearance-title">
    <h2 id="appearance-title">{t("Appearance")}</h2>
    <Select label={t("Display mode")} value={appearance.mode} options={displayModes} change={value => set("mode", value)} />
    <ThemeSettings appearance={appearance} variant={variant} change={change} />
    <BackgroundSettings background={appearance.background} missing={missingImage} change={change} />
    <details className="appearance-group">
      <summary>{t("Text and spacing")}</summary>
      <Select label={t("Body font")} value={appearance.font} options={fonts} change={value => set("font", value)} />
      <Select label={t("Heading font")} value={appearance.headingFont} options={fonts} change={value => set("headingFont", value)} />
      <Range label={t("Text size")} min={90} max={130} step={5} suffix="%" value={appearance.textSize} change={value => set("textSize", value)} />
      <label className="setting-row"><span>{t("Line spacing")}</span>
        <select value={appearance.lineHeight} onChange={event => set("lineHeight", Number(event.currentTarget.value))}>
          <option value={1.3}>{t("Tight")}</option><option value={1.5}>{t("Normal")}</option><option value={1.7}>{t("Relaxed")}</option>
        </select>
      </label>
      <Select label={t("Layout density")} value={appearance.density} options={densities} change={value => set("density", value)} />
    </details>
    <Select label={t("Splash screen")} value={appearance.splash} options={splashChoices} change={value => set("splash", value)} />
    <div className="controls desktop-buttons">
      <button type="button" onClick={() => void change(appearance => {
        const defaults = newAppearance();
        const { palettes, background } = appearance;
        Object.assign(appearance, defaults, { palettes, background: { ...defaults.background, local: background.local } });
      })}>{t("Reset appearance")}</button>
    </div>
  </section>;
}
