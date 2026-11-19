import { useCallback, useEffect, useRef, useState } from "react";
import { version } from "../../package.json";
import mark from "../assets/branding/TimerOS-mark-transparent.png";
import appIcon from "../assets/branding/TimerOS-app-icon-transparent.png";
import { StartupSplash } from "./StartupSplash";
import { TimerPage } from "./TimerPage";
import { useTimer } from "./useTimer";
import { useDesktop } from "./useDesktop";
import { DesktopPreferences } from "./DesktopPreferences";
import type { Interruption, Policy } from "./timer";

const appearances = ["System", "Light", "Dark"] as const;
type Appearance = typeof appearances[number];
type Page = "Timer" | "Settings";

const appearanceKey = "timeros.appearance.v1";
const interruptions: [Interruption, string][] = [
  ["lock", "When Windows locks"],
  ["sleep", "When the PC sleeps"],
  ["quit", "When TimerOS closes"],
];

function readAppearance(): Appearance {
  try {
    const saved = localStorage.getItem(appearanceKey);
    return appearances.find(appearance => appearance === saved) ?? "System";
  } catch {
    return "System";
  }
}

export function App() {
  const [starting, setStarting] = useState(true);
  const [appearance, setAppearance] = useState(readAppearance);
  const [saveFailed, setSaveFailed] = useState(false);
  const [page, setPage] = useState<Page>("Timer");
  const timer = useTimer();
  const desktop = useDesktop(timer);
  const main = useRef<HTMLElement>(null);
  const movedPage = useRef(false);

  const finishStartup = useCallback(() => {
    delete document.documentElement.dataset.starting;
    setStarting(false);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.appearance = appearance.toLowerCase();
  }, [appearance]);

  useEffect(() => {
    if (movedPage.current) main.current?.focus();
  }, [page]);

  function changeAppearance(next: Appearance) {
    setAppearance(next);
    try {
      localStorage.setItem(appearanceKey, next);
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }

  function navigate(next: Page) {
    if (page === next) return;
    movedPage.current = true;
    setPage(next);
  }

  useEffect(() => { if (timer.restored) finishStartup(); }, [timer.restored, finishStartup]);

  if (starting && !timer.view && !timer.error) {
    return <div className="startup" role="status" aria-label="Starting TimerOS">
      <img src={mark} alt="" width={108} height={108} />
    </div>;
  }
  if (starting && !timer.restored) return <StartupSplash onComplete={finishStartup} />;

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
            <section className="panel settings" aria-labelledby="appearance-title">
              <h2 id="appearance-title">Appearance</h2>
              <label className="setting-row">
                <span>Display mode</span>
                <select
                  value={appearance}
                  onChange={event => changeAppearance(event.currentTarget.value as Appearance)}
                >
                  {appearances.map(option => <option key={option}>{option}</option>)}
                </select>
              </label>
              {saveFailed && <p role="status">This display mode could only be applied for this launch.</p>}
            </section>
            {timer.view && <DesktopPreferences desktop={desktop} />}
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
