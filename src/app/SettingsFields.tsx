import { useState } from "react";
import { hexColor } from "./appearance";

export function Range({ label, value, min, max, step = 1, suffix, change }: {
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

export function Color({ label, value, change }: { label: string; value: string; change: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  function commit() {
    if (draft === null) return;
    const next = hexColor(draft.trim());
    setInvalid(!next);
    if (next) {
      change(next);
      setDraft(null);
    }
  }

  return <div className="setting-row color-row">
    <label>{label}
      <input type="color" value={value} onChange={event => {
        setDraft(null);
        setInvalid(false);
        change(event.currentTarget.value);
      }} />
    </label>
    <input type="text" aria-label={label + " hex"} aria-invalid={invalid || undefined} value={draft ?? value}
      maxLength={7} onChange={event => {
        setDraft(event.currentTarget.value);
        setInvalid(false);
      }} onBlur={commit} onKeyDown={event => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }} />
    {invalid && <span className="help" role="status">Enter a color such as #174ba7.</span>}
  </div>;
}
