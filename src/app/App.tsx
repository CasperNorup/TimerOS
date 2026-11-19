import { useCallback, useEffect, useRef, useState } from "react";
import { version } from "../../package.json";
import mark from "../assets/branding/TimerOS-mark-transparent.png";
import { StartupSplash } from "./StartupSplash";

const appearances = ["System", "Light", "Dark"] as const;
type Appearance = typeof appearances[number];
type Page = "Timer" | "Settings";

const appearanceKey = "timeros.appearance.v1";

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

  if (starting) return <StartupSplash onComplete={finishStartup} />;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <img src={mark} alt="" width={34} height={34} />
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
        {page === "Timer" ? (
          <>
            <h1 id="page-title">Timer</h1>
            <section className="panel timer" aria-labelledby="preset-title">
              <h2 id="preset-title">Classic Pomodoro</h2>
              <p className="time" aria-label="25 minutes">25:00</p>
              <p className="intervals">25 min focus · 5 min break</p>
            </section>
            <p className="preview-note">Timer controls arrive in Phase 1.</p>
          </>
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
          </>
        )}
      </main>
      <footer>TimerOS {version}</footer>
    </div>
  );
}
