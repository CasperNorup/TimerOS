export type HistoryEntry = {
  endedAt: number;
  name: string;
  subject: string;
  focusTime: number;
  reason: "finished" | "stopped";
  builtInName?: true;
};

export type StudyHistory = { enabled: boolean; sessions: HistoryEntry[] };
export const historyLimit = 1000;

export function readHistory(value: unknown): StudyHistory {
  const saved = value as Partial<StudyHistory> | undefined;
  const sessions = Array.isArray(saved?.sessions) ? saved.sessions.filter(entry =>
    entry && Number.isSafeInteger(entry.endedAt) && entry.endedAt >= 0 && entry.endedAt <= 8.64e15 &&
    typeof entry.name === "string" && entry.name.length <= 60 &&
    typeof entry.subject === "string" && entry.subject.length <= 60 &&
    Number.isSafeInteger(entry.focusTime) && entry.focusTime >= 0 &&
    (entry.reason === "finished" || entry.reason === "stopped")
  ).slice(-historyLimit) : [];
  return { enabled: saved?.enabled === true, sessions };
}

export function focusTotals(history: StudyHistory, today: number) {
  const midnight = new Date(today);
  midnight.setHours(0, 0, 0, 0);
  const tomorrow = new Date(midnight);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const monday = new Date(midnight);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const nextWeek = new Date(monday);
  nextWeek.setDate(nextWeek.getDate() + 7);
  let daily = 0;
  let weekly = 0;
  for (const { endedAt, focusTime } of history.sessions) {
    if (endedAt >= +midnight && endedAt < +tomorrow) daily += focusTime;
    if (endedAt >= +monday && endedAt < +nextWeek) weekly += focusTime;
  }
  return { daily, weekly };
}
