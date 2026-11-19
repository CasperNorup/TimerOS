import { useState } from "react";
import { hexColor } from "./appearance";
import { ColorPicker } from "./ColorPicker";
import { useLocale } from "./locale";

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
  const [open, setOpen] = useState(false);
  const { t } = useLocale();

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
    <span className="color-label">{label}</span>
    <button type="button" className="color-trigger" aria-label={t("Pick {color}", { color: label })}
      aria-haspopup="dialog" style={{ backgroundColor: value }} onClick={() => setOpen(true)} />
    <input type="text" aria-label={label + " " + t("hex")} aria-invalid={invalid || undefined} value={draft ?? value}
      maxLength={7} onChange={event => {
        setDraft(event.currentTarget.value);
        setInvalid(false);
      }} onBlur={commit} onKeyDown={event => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }} />
    {invalid && <span className="help" role="status">{t("Enter a color such as #174ba7.")}</span>}
    {open && <ColorPicker label={label} value={value} close={() => setOpen(false)} commit={color => {
      setDraft(null);
      setInvalid(false);
      change(color);
    }} />}
  </div>;
}
