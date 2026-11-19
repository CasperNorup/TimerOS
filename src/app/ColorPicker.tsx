import { useState, type PointerEvent } from "react";
import { hexColor } from "./appearance";
import { Dialog } from "./Dialog";
import { useLocale } from "./locale";

type Shade = { hue: number; saturation: number; brightness: number };
type RGB = [number, number, number];
type EyeDropperApi = { open: () => Promise<{ sRGBHex: string }> };

function rgb(hex: string): RGB {
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16)) as RGB;
}

function hex(channels: RGB) {
  return "#" + channels.map(value => Math.round(value).toString(16).padStart(2, "0")).join("");
}

function toShade(channels: RGB, savedHue = 0): Shade {
  const [r, g, b] = channels.map(n => n / 255);
  const max = Math.max(r, g, b);
  const depth = max - Math.min(r, g, b);
  const hue = depth === 0 ? savedHue / 60 : max === r ? (g - b) / depth :
    max === g ? 2 + (b - r) / depth : 4 + (r - g) / depth;
  return { hue: (hue * 60 + 360) % 360, saturation: max ? depth / max * 100 : 0, brightness: max * 100 };
}

function toRGB({ hue, saturation, brightness }: Shade): RGB {
  const value = brightness / 100;
  const chroma = value * saturation / 100;
  const h = (hue % 360) / 60;
  const ramp = chroma * (1 - Math.abs(h % 2 - 1));
  const sector: RGB[] = [[chroma, ramp, 0], [ramp, chroma, 0], [0, chroma, ramp],
    [0, ramp, chroma], [ramp, 0, chroma], [chroma, 0, ramp]];
  return sector[Math.floor(h)].map(channel => Math.round((channel + value - chroma) * 255)) as RGB;
}

export function ColorPicker({ label, value, commit, close }: {
  label: string; value: string; commit: (value: string) => void; close: () => void;
}) {
  const { t } = useLocale();
  const [shade, setShade] = useState(() => toShade(rgb(value)));
  const [input, setInput] = useState<{ hex?: string; rgb?: string[] }>({});
  const [samplingError, setSamplingError] = useState(false);
  const EyeDropper = (window as Window & { EyeDropper?: new () => EyeDropperApi }).EyeDropper;
  const channels = toRGB(shade);
  const draft = hex(channels);
  const invalid = input.hex !== undefined && !hexColor(input.hex) ||
    Boolean(input.rgb?.some(value => !/^\d{1,3}$/.test(value) || Number(value) > 255));

  function adjust(partial: Partial<Shade>) {
    setShade(previous => ({ ...previous, ...partial }));
    setInput({});
  }

  function point(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (value: number) => Math.max(0, Math.min(1, value)) * 100;
    adjust({ saturation: fraction((event.clientX - box.left) / box.width),
      brightness: fraction(1 - (event.clientY - box.top) / box.height) });
  }

  async function sample() {
    if (!EyeDropper) return;
    setSamplingError(false);
    try {
      const color = hexColor((await new EyeDropper().open()).sRGBHex);
      if (color) {
        setShade(toShade(rgb(color), shade.hue));
        setInput({});
      }
    } catch (problem) {
      if (!(problem instanceof DOMException && problem.name === "AbortError")) setSamplingError(true);
    }
  }

  return <Dialog title={label} close={close}>
    <div className="color-map" aria-hidden="true" style={{ backgroundColor: "hsl(" + shade.hue + " 100% 50%)" }}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); point(event); }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) point(event); }}>
      <span style={{ left: shade.saturation + "%", top: 100 - shade.brightness + "%" }} />
    </div>
    <div className="color-picker-tools">
      <div className="color-sample" role="img" aria-label={t("Color preview") + " " + draft} style={{ background: draft }} />
      <label className="field"><span>{t("Hue")}</span>
        <input className="hue-slider" type="range" min={0} max={359} value={Math.floor(shade.hue)}
          onChange={event => adjust({ hue: event.currentTarget.valueAsNumber })} />
      </label>
      {EyeDropper && <button type="button" onClick={() => void sample()}>{t("Eyedropper")}</button>}
    </div>
    <div className="picker-sliders">
      <label className="field"><span>{t("Saturation")}</span>
        <input type="range" min={0} max={100} value={Math.round(shade.saturation)}
          onChange={event => adjust({ saturation: event.currentTarget.valueAsNumber })} />
      </label>
      <label className="field"><span>{t("Brightness")}</span>
        <input type="range" min={0} max={100} value={Math.round(shade.brightness)}
          onChange={event => adjust({ brightness: event.currentTarget.valueAsNumber })} />
      </label>
    </div>
    <div className="picker-fields">
      <label className="field"><span>Hex</span>
        <input value={input.hex ?? draft} onChange={event => {
          const text = event.currentTarget.value;
          setInput({ hex: text });
          const color = hexColor(text);
          if (color) setShade(toShade(rgb(color), shade.hue));
        }} maxLength={7} spellCheck={false} />
      </label>
      {["Red", "Green", "Blue"].map((channel, index) => (
        <label className="field" key={channel}><span>{t(channel)}</span>
          <input inputMode="numeric" value={input.rgb?.[index] ?? channels[index]} maxLength={3}
            onChange={event => {
              const entries = input.rgb ? [...input.rgb] : channels.map(String);
              entries[index] = event.currentTarget.value;
              setInput({ rgb: entries });
              if (entries.every(value => /^\d{1,3}$/.test(value) && Number(value) <= 255)) {
                setShade(toShade(entries.map(Number) as RGB, shade.hue));
              }
            }} />
        </label>
      ))}
    </div>
    {invalid && <p role="status" className="help">{t("Enter a six-digit hex color or RGB values from 0 to 255.")}</p>}
    {samplingError && <p role="status" className="help">{t("The eyedropper could not read a color.")}</p>}
    <div className="controls dialog-actions">
      <button type="button" onClick={close}>{t("Cancel")}</button>
      <button type="button" className="primary" disabled={invalid} onClick={() => { commit(draft); close(); }}>{t("Apply")}</button>
    </div>
  </Dialog>;
}
