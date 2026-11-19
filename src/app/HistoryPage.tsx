import { useEffect, useState } from "react";
import { Dialog } from "./Dialog";
import { focusTotals } from "./history";
import { useLocale } from "./locale";
import type { useTimer } from "./useTimer";

function focusLabel(ms: number, t: ReturnType<typeof useLocale>["t"]): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes >= 60 ? t("{hours} h {minutes} min", { hours: Math.floor(minutes / 60), minutes: minutes % 60 })
    : minutes >= 1 ? t("{minutes} min {seconds} s", { minutes, seconds: seconds % 60 }) : t("{seconds} s", { seconds });
}

export function HistoryPage({ model }: { model: ReturnType<typeof useTimer> }) {
  const { t, language } = useLocale();
  const [confirm, setConfirm] = useState(false);
  const [today, setToday] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const history = model.view?.history;
  const date = new Intl.DateTimeFormat(language === "da" ? "da-DK" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
  if (!history) return <h1 id="page-title">{t("History")}</h1>;
  const totals = focusTotals(history, today);

  return <>
    <h1 id="page-title">{t("History")}</h1>
    <div className="history-totals">
      <section className="panel history-total"><h2>{t("Today")}</h2><strong>{focusLabel(totals.daily, t)}</strong></section>
      <section className="panel history-total"><h2>{t("This week")}</h2><strong>{focusLabel(totals.weekly, t)}</strong></section>
    </div>
    <section className="panel settings" aria-label={t("Study history settings")}>
      <label className="setting-row"><span>{t("Record study history")}</span>
        <input type="checkbox" checked={history.enabled} disabled={model.busy} onChange={event => {
          const enabled = event.currentTarget.checked;
          void model.update(state => {
            state.history.enabled = enabled;
            if (!enabled && state.session) delete state.session.studySubject;
          });
        }} />
      </label>
      <p className="help">{t("Sessions are grouped by the date they end. Weeks start on Monday.")}</p>
      {!history.enabled && <p className="help">{t("Turn on recording to save future sessions.")}</p>}
      {history.sessions.length > 0 && <div className="controls desktop-buttons">
        <button type="button" onClick={() => setConfirm(true)}>{t("Clear history")}</button>
      </div>}
    </section>
    <section className="panel settings history-list" aria-labelledby="recent">
      <h2 id="recent">{t("Recent sessions")}</h2>
      {history.sessions.length === 0 ? <p className="help">{t("No sessions recorded yet.")}</p>
        : <ul>{history.sessions.slice(-50).reverse().map((entry, index) =>
          <li key={entry.endedAt + "-" + index}>
            <div><strong>{entry.subject || (entry.builtInName === true ? t(entry.name) : entry.name)}</strong>
              {entry.subject && <span>{entry.builtInName === true ? t(entry.name) : entry.name}</span>}
              <time dateTime={new Date(entry.endedAt).toISOString()}>{date.format(entry.endedAt)}</time>
            </div>
            <div><strong>{focusLabel(entry.focusTime, t)}</strong>
              <span>{t(entry.reason === "stopped" ? "Partial" : "Completed")}</span>
            </div>
          </li>)}</ul>}
    </section>
    {confirm && <Dialog title={t("Clear history")} close={() => setConfirm(false)}>
      <p>{t("Delete all recorded study sessions?")}</p>
      <div className="controls dialog-actions">
        <button type="button" onClick={() => setConfirm(false)}>{t("Cancel")}</button>
        <button type="button" className="primary" disabled={model.busy} onClick={() =>
          void model.update(state => {
            state.history.sessions = [];
            if (state.session) delete state.session.studySubject;
          }).then(ok => { if (ok) setConfirm(false); })}>{t("Delete recorded sessions")}</button>
      </div>
    </Dialog>}
  </>;
}
