import { strict as assert } from "node:assert";
import { test } from "node:test";
import { builtInThemes, contrast, miniColors, newAppearance, readAppearance, themeColors } from "../src/app/appearance.ts";
import { newDesktopSettings } from "../src/app/desktopSettings.ts";
import { decodeWorkspace, newWorkspace } from "../src/app/timer.ts";

test("older workspaces retain their display mode and independent mini timer colors", () => {
  const { appearance: _appearance, ...previous } = newWorkspace();
  previous.desktop.mini = { ...previous.desktop.mini, color: "#212121" };
  const older = JSON.parse(JSON.stringify(previous));
  delete older.desktop.mini.inheritTheme;
  const restored = decodeWorkspace(JSON.stringify(older), "Dark");
  assert.equal(restored.appearance.mode, "Dark");
  assert.equal(restored.appearance.splash, "Bloom");
  assert.equal(restored.desktop.mini.inheritTheme, false);
  assert.equal(restored.desktop.mini.color, "#212121");
});

test("saved themes, image settings, typography, and splash take precedence after migration", () => {
  const workspace = newWorkspace("Light");
  const { appearance } = workspace;
  const template = builtInThemes[1];
  const id = "12345678-1234-4321-8ace-123456789000";
  appearance.theme = "custom-" + id;
  appearance.palettes = [{ ...template, id: appearance.theme, name: "Study" }];
  appearance.background = { ...appearance.background, kind: "local", local: { id, name: "study.webp" }, fit: "contain", x: 100 };
  appearance.headingFont = "Georgia";
  appearance.density = "Spacious";
  appearance.splash = "Signal";
  assert.deepEqual(decodeWorkspace(JSON.stringify(workspace), "Dark").appearance, appearance);
});

test("unknown appearance variants and malformed colors fall back without discarding the workspace", () => {
  const decoded = readAppearance({ theme: "missing", font: "missing", textSize: 500,
    background: { kind: "gradient", color: "url(other)", angle: -100, x: 200, local: { id: "../file" } },
  });
  const defaults = newAppearance();
  assert.equal(decoded.theme, defaults.theme);
  assert.equal(decoded.font, defaults.font);
  assert.equal(decoded.background.color, defaults.background.color);
  assert.equal(decoded.background.local, null);
  assert.equal(decoded.background.angle, 0);
  assert.equal(decoded.background.x, 100);
  assert.equal(decoded.textSize, 130);
});

test("light, dark, and custom palettes keep readable text on their actual surfaces", () => {
  const palettes = builtInThemes.flatMap(theme => [theme.light, theme.dark]);
  palettes.push({ canvas: "#000000", surface: "#777777", accent: "#777777" },
    { canvas: "#f8f5ff", surface: "#000000", accent: "#000000" });
  for (const palette of palettes) {
    const colors = themeColors(palette);
    for (const [ink, surface] of [
      [colors.text, colors.surface], [colors.canvasText, colors.canvas],
      [colors.muted, colors.surface], [colors.accent, colors.surface],
      [colors.primaryText, colors.primary], [colors.primaryText, colors.primaryHover],
      [colors.hoverText, colors.hover], [colors.selectedText, colors.selected],
    ]) assert.ok(contrast(ink, surface) >= 4.5, ink + " on " + surface);
  }
  const mini = newDesktopSettings().mini;
  const palette = builtInThemes[1].dark;
  assert.equal(miniColors(mini, palette).color, mini.color);
  const inherited = miniColors({ ...mini, inheritTheme: true }, palette);
  assert.equal(inherited.color, palette.surface);
  assert.ok(contrast(inherited.text, inherited.color) >= 4.5);
});
