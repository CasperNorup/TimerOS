import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { version } from "../../package.json";
import appIcon from "../assets/branding/TimerOS-app-icon-transparent.png";
import { StartupSplash } from "./StartupSplash";
import { TimerPage } from "./TimerPage";
import { useTimer } from "./useTimer";
import { useDesktop } from "./useDesktop";
import { DesktopPreferences } from "./DesktopPreferences";
import { AppearancePreferences } from "./AppearancePreferences";
import { HistoryPage } from "./HistoryPage";
import { About } from "./About";
import { activeTheme, newAppearance, paletteTokens, typographyTokens } from "./appearance";
import { useBackgroundImage } from "./appearanceImages";
import { Locale, translator, type Language } from "./locale";
import type { Interruption, Policy } from "./timer";

type Page = "Timer" | "History" | "Settings";
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
  const [about, setAbout] = useState(false);
  const timer = useTimer();
  const language = timer.view?.language ?? "en";
  const t = translator(language);
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
    root.lang = language;
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
  }, [appearance, background, language, palette, url, variant]);

  useEffect(() => {
    if (movedPage.current) {
      main.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
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
    return <div className="startup" role="status" aria-label={t("Starting TimerOS")} />;
  }
  if (starting && !skipStartup && appearance.splash !== "Off") {
    return <Locale.Provider value={language}><StartupSplash choice={appearance.splash} onComplete={finishStartup} /></Locale.Provider>;
  }

  return (
    <Locale.Provider value={language}>
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="brand">
            <img src={appIcon} alt="" width={34} height={34} />
            <span>TimerOS</span>
          </div>
          <div className="controls">
            {page === "Timer" ? (
              <button type="button" onClick={() => navigate("Settings")}>{t("Settings")}</button>
            ) : (
              <button type="button" onClick={() => navigate(page === "History" ? "Settings" : "Timer")}>
                {t(page === "History" ? "Back to Settings" : "Back to Timer")}
              </button>
            )}
          </div>
        </div>
      </header>

      <main ref={main} tabIndex={-1} aria-labelledby={page === "Timer" ? "timer-title" : "page-title"}>
        {timer.error && <p className="status-error" role="alert">{t(timer.error)}</p>}
        {desktop.error && <p className="status-error" role="alert">{t(desktop.error)}</p>}
        {desktop.report.message && <div className="alert-status">
          <span role="status">{desktop.report.message}</span>
          <div className="controls"><button type="button" onClick={() => desktop.command("dismiss")}>{t("Dismiss alert")}</button></div>
        </div>}
        {!timer.view && !timer.busy && <button type="button" onClick={() => void timer.load()}>{t("Retry loading timer")}</button>}
        <div hidden={page !== "Timer"}>
          <TimerPage model={timer} onStart={() => desktop.command("start")} />
        </div>
        {page === "History" && <HistoryPage model={timer} />}
        {page === "Settings" && (
          <>
            <h1 id="page-title">{t("Settings")}</h1>
            <div className="controls settings-links">
              <button type="button" onClick={() => navigate("History")}>{t("History")}</button>
              <button type="button" aria-haspopup="dialog" title={t("About TimerOS") + " v" + version}
                onClick={() => setAbout(true)}>{t("About TimerOS")}</button>
            </div>
            {timer.view && <section className="panel settings language-settings" aria-labelledby="language-title">
              <h2 id="language-title">{t("Language")}</h2>
              <label className="setting-row"><span>{t("App language")}</span>
                <select value={language} onChange={event => {
                  const next = event.currentTarget.value as Language;
                  void timer.update(state => { state.language = next; });
                }}>
                  <option value="en" lang="en">English</option><option value="da" lang="da">Dansk</option>
                </select>
              </label>
            </section>}
            {timer.view && <AppearancePreferences appearance={appearance} variant={variant} missingImage={missing}
              change={apply => timer.update(state => apply(state.appearance))} />}
            {timer.view && <DesktopPreferences desktop={desktop} palette={palette} />}
            {timer.view && <section className="panel settings" aria-labelledby="recovery-title">
              <h2 id="recovery-title">{t("Timer recovery")}</h2>
              {interruptions.map(([event, label]) => (
                <label className="setting-row" key={event}>
                  <span>{t(label)}</span>
                  <select value={timer.view?.policies[event]} disabled={timer.busy}
                    onChange={change => {
                      const policy = change.currentTarget.value as Policy;
                      void timer.update(state => { state.policies[event] = policy; });
                    }}>
                    <option value="pause">{t("Pause and resume manually")}</option>
                    <option value="continue">{t("Keep time running")}</option>
                  </select>
                </label>
              ))}
              {timer.trackingError && <p role="status">{t(timer.trackingError)}</p>}
            </section>}
            {desktop.available && <div className="controls desktop-buttons">
              <button type="button" onClick={() => desktop.command("quit")}>{t("Quit TimerOS")}</button>
            </div>}
          </>
        )}
      </main>
      {about && <About close={() => setAbout(false)} />}
    </div>
    </Locale.Provider>
  );
}
