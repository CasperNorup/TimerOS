import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { version } from "../../package.json";
import appIcon from "../assets/branding/TimerOS-app-icon-transparent.png";
import { StartupSplash } from "./StartupSplash";
import { TimerPage } from "./TimerPage";
import { useTimer } from "./useTimer";
import { useDesktop } from "./useDesktop";
import { DesktopPreferences } from "./DesktopPreferences";
import { AppearancePreferences } from "./AppearancePreferences";
import { activeTheme, newAppearance, paletteTokens, typographyTokens } from "./appearance";
import { useBackgroundImage } from "./appearanceImages";
import type { Interruption, Policy } from "./timer";

type Page = "Timer" | "Settings";
const defaultAppearance = newAppearance();
const interruptions: [Interruption, string][] = [
  ["lock", "When Windows locks"],
  ["sleep", "When the PC sleeps"],
  ["quit", "When TimerOS closes"],
];

export function App() {
  const [starting, setStarting] = useState(true);
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  const [page, setPage] = useState<Page>("Timer");
  const timer = useTimer();
  const appearance = timer.view?.appearance ?? defaultAppearance;
  const variant = appearance.mode === "Dark" || (appearance.mode === "System" && systemDark) ? "dark" : "light";
  const palette = activeTheme(appearance)[variant];
  const desktop = useDesktop(timer, palette);
  const background = appearance.background;
  const { url, missing } = useBackgroundImage(background);
  const main = useRef<HTMLElement>(null);
  const movedPage = useRef(false);

  const finishStartup = useCallback(() => {
    delete document.documentElement.dataset.starting;
    setStarting(false);
  }, []);

  useEffect(() => {
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    scheme.addEventListener("change", onChange);
    return () => scheme.removeEventListener("change", onChange);
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.appearance = variant;
    root.toggleAttribute("data-custom-background", Boolean(url || background.kind === "solid" || background.kind === "gradient"));
    const image = background.kind === "gradient"
      ? "linear-gradient(" + background.angle + "deg, " + background.color + ", " + background.end + ")"
      : url ? 'url("' + url + '")' : "none";
    const styles = {
      ...paletteTokens(palette), ...typographyTokens(appearance),
      "--background-color": background.kind === "solid" ? background.color : palette.canvas,
      "--background-image": image,
      "--background-position": url ? background.x + "% " + background.y + "%" : "center",
      "--background-size": url ? background.fit : "cover",
    };
    for (const [property, value] of Object.entries(styles)) root.style.setProperty(property, value);
  }, [appearance, background, palette, url, variant]);

  useEffect(() => {
    if (movedPage.current) main.current?.focus();
  }, [page]);

  function navigate(next: Page) {
    if (page === next) return;
    movedPage.current = true;
    setPage(next);
  }

  const skipStartup = timer.restored || appearance.splash === "Off" || Boolean(timer.error && !timer.view);
  useLayoutEffect(() => {
    if (starting && skipStartup) finishStartup();
  }, [starting, skipStartup, finishStartup]);

  if (starting && !timer.view && !timer.error) {
    return <div className="startup" role="status" aria-label="Starting TimerOS" />;
  }
  if (starting && !skipStartup && appearance.splash !== "Off") {
    return <StartupSplash choice={appearance.splash} onComplete={finishStartup} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img src={appIcon} alt="" width={34} height={34} />
          <span>TimerOS</span>
        </div>
        <nav aria-label="Main navigation">
          {(["Timer", "Settings"] as const).map(item => (
            <button
              key={item}
              type="button"
              aria-current={page === item ? "page" : undefined}
              onClick={() => navigate(item)}
            >{item}</button>
          ))}
        </nav>
      </header>

      <main ref={main} tabIndex={-1} aria-labelledby="page-title">
        {timer.error && <p className="status-error" role="alert">{timer.error}</p>}
        {desktop.error && <p className="status-error" role="alert">{desktop.error}</p>}
        {desktop.report.message && <div className="alert-status">
          <span role="status">{desktop.report.message}</span>
          <div className="controls"><button type="button" onClick={() => desktop.command("dismiss")}>Dismiss alert</button></div>
        </div>}
        {!timer.view && !timer.busy && <button type="button" onClick={() => void timer.load()}>Retry loading timer</button>}
        {page === "Timer" ? (
          <TimerPage model={timer} onStart={() => desktop.command("start")} />
        ) : (
          <>
            <h1 id="page-title">Settings</h1>
            {timer.view && <AppearancePreferences appearance={appearance} variant={variant} missingImage={missing}
              change={apply => timer.update(state => apply(state.appearance))} />}
            {timer.view && <DesktopPreferences desktop={desktop} palette={palette} />}
            {timer.view && <section className="panel settings" aria-labelledby="recovery-title">
              <h2 id="recovery-title">Timer recovery</h2>
              {interruptions.map(([event, label]) => (
                <label className="setting-row" key={event}>
                  <span>{label}</span>
                  <select value={timer.view?.policies[event]} disabled={timer.busy}
                    onChange={change => {
                      const policy = change.currentTarget.value as Policy;
                      void timer.update(state => { state.policies[event] = policy; });
                    }}>
                    <option value="pause">Pause and resume manually</option>
                    <option value="continue">Keep time running</option>
                  </select>
                </label>
              ))}
              {timer.trackingError && <p role="status">{timer.trackingError}</p>}
            </section>}
            {desktop.available && <div className="controls desktop-buttons">
              <button type="button" onClick={() => desktop.command("quit")}>Quit TimerOS</button>
            </div>}
          </>
        )}
      </main>
      <footer>TimerOS {version}</footer>
    </div>
  );
}
