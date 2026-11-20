import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { verifyAppearance, verifySavedAppearance } from "./appearance-smoke.mjs";
import { verifyPhaseFive, verifySavedPhaseFive } from "./phase5-smoke.mjs";

const endpoint = "http://127.0.0.1:" + process.env.TIMEROS_WEBVIEW_PORT;
const scenario = process.argv[2] || "initial";
const deadline = Date.now() + 25_000;
const smokeTitle = "TimerOS Smoke Test";
const miniTitle = "TimerOS Mini Timer";
const alertTitle = "TimerOS Screen Alert";

function signal(kind, title = smokeTitle, hotkey = 0) {
  const result = spawnSync("pwsh.exe", ["-NoProfile", "-File", "tests/windows-signal.ps1",
    "-TargetProcessId", process.env.TIMEROS_TEST_PID, "-Title", title, "-Signal", kind, "-Hotkey", String(hotkey)],
  { encoding: "utf8" });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  return result.stdout.trim();
}

async function inspectUntil(title, condition) {
  const deadline = Date.now() + 15_000;
  let view;
  do {
    view = JSON.parse(signal("inspect", title));
    if (condition(view)) return view;
    await delay(150);
  } while (Date.now() < deadline);
  assert.fail(title + " did not reach the expected state: " + JSON.stringify(view));
}

function assertPassive(view) {
  assert.ok(view.visible && view.transparent && view.topmost && view.noActivate && view.layered);
  assert.equal(view.hit, -1);
  assert.notEqual(view.handle, view.foreground);
}

while (true) {
  try {
    if ((await fetch(endpoint + "/json/version", { signal: AbortSignal.timeout(750) })).ok) break;
  } catch {
    // WebView2 may still be starting.
  }
  if (Date.now() >= deadline) throw new Error("TimerOS did not expose its test WebView.");
  await delay(250);
}

const browser = await chromium.connectOverCDP(endpoint);
try {
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.waitForEvent("page");
  const heading = page.getByRole("heading", { name: "Timer", exact: true });
  await heading.waitFor({ timeout: 15_000 });
  const named = name => page.getByRole("button", { name, exact: true });
  const current = page.getByRole("region", { name: "Current session" });

  if (scenario === "restored") {
    await current.getByText("Focus · Paused", { exact: true }).waitFor();
    await current.getByRole("heading", { name: "Review", exact: true }).waitFor();
    await named("Resume").click();
    await named("Pause").waitFor();
    await named("Settings").click();
    await verifySavedAppearance(page);
    await verifySavedPhaseFive(page);
    await page.getByText("Mini timer", { exact: true }).click();
    assert.equal(await page.getByRole("combobox", { name: "Placement" }).inputValue(), "free");
    await page.getByText("Alerts and sound", { exact: true }).click();
    assert.equal(await page.getByRole("checkbox", { name: "Repeat until dismissed" }).isChecked(), true);
    await named("Back to Timer").click();
    await named("Stop").click();
    await page.getByText(/Session stopped/).waitFor();
    console.log("Verified a clean app restart restores an unfinished session in the paused state.");
  } else {
    await verifyFirstLaunch(page, heading, named, current);
  }
} finally {
  await browser.close();
}

async function verifyFirstLaunch(page, heading, named, current) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".startup-animation.is-playing svg").waitFor({ timeout: 8_000 });
  await heading.waitFor({ timeout: 12_000 });
  assert.equal(await page.getByText("25:00", { exact: true }).count(), 1);
  const headerIcon = await page.locator(".brand img").evaluate(async image => {
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] < 16) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
    return {
      asset: image.src,
      slot: image.getBoundingClientRect().width,
      visible: 34 * Math.max(right - left, bottom - top) / canvas.width,
    };
  });
  assert.match(headerIcon.asset, /TimerOS-app-icon-transparent/);
  assert.equal(headerIcon.slot, 34);
  assert.ok(Math.abs(headerIcon.visible - 32.7) < 0.25, "The transparent T matches the approved BudgetOS scale");
  console.log("Verified the transparent TimerOS mark at the approved size in the app header.");

  await page.getByRole("button", { name: "Settings" }).click();
  const mode = page.getByRole("combobox", { name: "Display mode" });
  await mode.selectOption("Dark");
  await page.waitForFunction(() => document.documentElement.dataset.appearance === "dark");
  await page.getByRole("button", { name: "Back to Timer", exact: true }).click();

  await page.emulateMedia({ reducedMotion: "reduce" });
  const requestedBloom = [];
  page.on("request", request => {
    if (request.url().includes("TimerOS-splash-bloom")) requestedBloom.push(request.url());
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await heading.waitFor({ timeout: 10_000 });
  assert.equal(requestedBloom.length, 0, "Reduced motion should skip the startup animation");
  assert.equal(await page.locator("html").getAttribute("data-appearance"), "dark");
  await page.getByRole("button", { name: "Settings" }).click();
  assert.equal(await mode.inputValue(), "Dark");
  await named("Back to Timer").click();
  await verifyAppearance(page, heading, named);
  await verifyPhaseFive(page, async () => {
    await inspectUntil(smokeTitle, window => window.minimized);
    signal("taskbar");
    await inspectUntil(smokeTitle, window => window.visible && !window.minimized);
  }, { native: true });

  await page.getByRole("combobox", { name: "When the PC sleeps" }).selectOption("continue");
  await page.waitForFunction(() => Array.from(document.querySelectorAll('select'))
    .some(select => select.labels?.[0]?.textContent.includes("When the PC sleeps") && !select.disabled));
  await named("Back to Timer").click();
  await verifyAdditionalModes(page, named, current);
  await page.getByRole("combobox", { name: "Preset", exact: true }).selectOption("classic");
  await page.getByText("Customize session or preset", { exact: true }).click();
  await page.getByRole("textbox", { name: "Preset name" }).fill("Review");
  await page.getByRole("combobox", { name: "Timer mode" }).selectOption("countdown");
  await page.getByRole("spinbutton", { name: "Focus (min)" }).fill("2");
  await named("Save as new preset").click();
  await page.waitForFunction(() => document.querySelector("select")?.selectedOptions[0]?.text === "Review");
  await named("Start").click();
  await current.getByRole("heading", { name: "Review", exact: true }).waitFor();
  await named("Pause").waitFor();

  await verifySurfaces(page, named);
  signal("lock");
  await current.getByText("Focus · Paused", { exact: true }).waitFor();
  signal("unlock");
  await named("Resume").click();
  await named("Pause").waitFor();
  const beforeSleep = await current.locator(".time").textContent();
  signal("sleep");
  await page.waitForTimeout(2200);
  signal("wake");
  await page.waitForFunction(previous => document.querySelector(".time")?.textContent !== previous, beforeSleep);
  await named("Pause").waitFor();
  console.log("Verified Bloom, reduced motion, preferences, saved presets, and native Windows lock and sleep message handling.");
  await named("Settings").click();
  await named("Quit TimerOS").evaluate(button => button.click());
}

async function verifyAdditionalModes(page, named, current) {
  const preset = page.getByRole("combobox", { name: "Preset", exact: true });
  const elapsed = current.locator('[aria-label="Time elapsed"]');
  const remaining = current.locator('[aria-label="Time remaining"]');

  async function start() {
    await named("Start").click();
    await current.waitFor();
    await inspectUntil(smokeTitle, window => window.minimized);
    assertPassive(await inspectUntil(miniTitle, window => window.visible));
    signal("taskbar");
    await inspectUntil(smokeTitle, window => window.visible && !window.minimized);
  }

  async function expectAlert(label) {
    await page.locator(".alert-status").getByText(label, { exact: true }).waitFor();
    assertPassive(await inspectUntil(alertTitle, window => window.visible && window.opacity > 0));
    await named("Dismiss alert").click();
    await named("Dismiss alert").waitFor({ state: "hidden" });
  }

  await preset.selectOption("stopwatch");
  await start();
  await elapsed.waitFor();
  await page.waitForFunction(() => document.querySelector('[aria-label="Time elapsed"]')?.textContent !== "0:00");
  assert.equal(await current.locator("progress").count(), 0);
  await named("Pause").click();
  await named("Resume").click();
  await named("Stop").click();
  await page.getByText(/^Session stopped/).waitFor();

  await preset.selectOption("sequence");
  await page.getByText("Customize session or preset", { exact: true }).click();
  const firstBlock = page.getByRole("textbox", { name: "Block 1 name" });
  await firstBlock.fill("Read notes");
  await named("Move block 2 up").click();
  assert.equal(await firstBlock.inputValue(), "Stretch");
  await named("Move block 1 down").click();
  assert.equal(await firstBlock.inputValue(), "Read notes");
  await page.getByRole("checkbox", { name: "Repeat the sequence" }).check();
  await page.getByRole("textbox", { name: "Preset name" }).fill("Exam review");
  await named("Save as new preset").click();
  await page.waitForFunction(() => document.querySelector("select")?.selectedOptions[0]?.text === "Exam review");
  await start();
  await current.getByText("Read notes", { exact: true }).waitFor();
  await named("Skip").click();
  await current.getByText("Stretch", { exact: true }).waitFor();
  await expectAlert("Focus ended");
  await named("Skip").click();
  await current.getByText("Practice", { exact: true }).waitFor();
  await expectAlert("Break ended");
  await named("Skip").click();
  await current.getByText("Read notes", { exact: true }).waitFor();
  await expectAlert("Focus ended");
  await named("Stop").click();
  await page.getByText(/^Session stopped/).waitFor();

  await preset.selectOption("flowtime");
  await start();
  await elapsed.waitFor();
  await named("Take a break").click();
  const duration = page.getByRole("spinbutton", { name: "Break duration (min)" });
  assert.equal(await duration.inputValue(), "5");
  await duration.fill("2");
  await named("Start break").click();
  await remaining.waitFor();
  assert.match(await remaining.textContent(), /^(?:2:00|1:[0-5]\d)$/);
  await expectAlert("Focus ended");
  await named("Skip").click();
  await elapsed.waitFor();
  await expectAlert("Break ended");
  await named("Stop").click();
  await page.getByText(/^Session stopped/).waitFor();
  console.log("Verified Stopwatch, a saved repeating sequence, and a Flowtime break override with Windows mini timer and alerts.");
}

async function verifySurfaces(page, named) {
  await inspectUntil(smokeTitle, window => window.minimized);
  const mini = await inspectUntil(miniTitle, window => window.visible);
  assertPassive(mini);
  assert.ok(mini.left >= mini.workLeft && mini.right <= mini.workRight &&
    mini.top >= mini.workTop && mini.bottom <= mini.workBottom, "Mini timer belongs inside the Windows work area");
  const hiddenTime = await page.locator(".time").textContent();
  await page.waitForFunction(before => document.querySelector(".time")?.textContent !== before, hiddenTime,
    { timeout: 7000 });

  signal("taskbar");
  await inspectUntil(smokeTitle, window => window.visible && !window.minimized);
  signal("hotkey", smokeTitle, 1);
  await named("Resume").waitFor({ timeout: 8000 });
  signal("hotkey", smokeTitle, 1);
  await named("Pause").waitFor({ timeout: 8000 });

  await named("Settings").click();
  await page.getByText("Mini timer", { exact: true }).click();
  await named("Move mini timer").click();
  await named("Save position").waitFor();
  const moving = await inspectUntil(miniTitle, window => window.visible && !window.transparent);
  assert.equal(moving.hit, 2);
  signal("shift", miniTitle);
  await named("Save position").click();
  await page.waitForFunction(() => Array.from(document.querySelectorAll("select"))
    .some(el => el.labels?.[0]?.textContent.startsWith("Placement") && el.value === "free"));
  const moved = await inspectUntil(miniTitle, window => window.visible && window.transparent);
  assertPassive(moved);
  assert.notEqual(moved.left, mini.left);

  await page.getByText("Alerts and sound", { exact: true }).click();
  assert.equal(await page.getByRole("checkbox", { name: "Play alert sounds" }).isChecked(), false);
  assert.equal(await page.getByRole("combobox", { name: "Alert display" }).inputValue(), "all");
  await page.getByRole("checkbox", { name: "Repeat until dismissed" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('input[type="checkbox"]')]
    .find(field => field.labels?.[0]?.textContent.includes("Repeat until dismissed"))?.checked);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await named("Preview visual").click();
  const samples = JSON.parse(signal("sample", alertTitle));
  assert.ok(samples.levels >= 18, "Expected a smooth fade with multiple opacity levels: " + JSON.stringify(samples));
  await named("Stop preview / dismiss").click();
  await inspectUntil(alertTitle, window => !window.visible);
  console.log("Native fade used " + samples.levels + " distinct nonzero opacity levels in " + samples.elapsedMs + " ms.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("combobox", { name: "Visual style" }).selectOption("static");
  await page.waitForFunction(() => {
    const inputs = [...document.querySelectorAll('input[type="checkbox"]')];
    const repeat = inputs.find(field => field.labels?.[0]?.textContent.includes("Repeat until dismissed"));
    const styles = [...document.querySelectorAll("select")];
    const style = styles.find(field => field.labels?.[0]?.textContent.startsWith("Visual style"));
    return repeat?.checked && style?.value === "static";
  });

  for (const layout of ["maximize", "borderless"]) {
    signal(layout);
    await named("Preview visual").click();
    const alert = await inspectUntil(alertTitle, window => window.visible && window.opacity > 0);
    assertPassive(alert);
    assert.equal(alert.left, alert.screenLeft);
    assert.equal(alert.right, alert.screenRight);
    assert.equal(alert.top, alert.screenTop);
    assert.equal(alert.bottom, alert.screenBottom);
    assert.ok(alert.opacity < 255);
    assertPassive(await inspectUntil(miniTitle, window => window.visible));
    if (layout === "maximize") {
      await delay(4300);
      assertPassive(await inspectUntil(alertTitle, window => window.visible));
    }
    signal("hotkey", smokeTitle, 5);
    await inspectUntil(alertTitle, window => !window.visible);
  }

  // The native close button keeps the active session accessible from the tray or shortcut.
  signal("quit");
  await inspectUntil(smokeTitle, window => !window.visible || window.minimized);
  signal("hotkey", smokeTitle, 4);
  await inspectUntil(smokeTitle, window => window.visible && !window.minimized);
  await named("Back to Timer").click();
  await named("Pause").waitFor();
  console.log("Verified taskbar restore, click-through mini timer, saved drag placement, maximized and borderless-fullscreen alerts, shortcut dismissal, and close-to-tray.");
}
