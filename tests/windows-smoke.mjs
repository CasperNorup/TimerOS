import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const endpoint = "http://127.0.0.1:" + process.env.TIMEROS_WEBVIEW_PORT;
const scenario = process.argv[2] || "initial";
const deadline = Date.now() + 25_000;

function signal(kind) {
  const result = spawnSync("pwsh.exe", ["-NoProfile", "-File", "tests/windows-signal.ps1",
    "-Title", "TimerOS Smoke Test", "-Signal", kind], { encoding: "utf8" });
  assert.equal(result.status, 0, result.error?.message || result.stderr);
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
  assert.match(await page.locator("footer").innerText(), /^TimerOS \d+\.\d+\.\d+$/);

  await page.getByRole("button", { name: "Settings" }).click();
  const mode = page.getByRole("combobox", { name: "Display mode" });
  await mode.selectOption("Dark");
  await page.waitForFunction(() => document.documentElement.dataset.appearance === "dark");
  await page.getByRole("button", { name: "Timer", exact: true }).click();

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

  await page.getByRole("combobox", { name: "When the PC sleeps" }).selectOption("continue");
  await page.waitForFunction(() => Array.from(document.querySelectorAll('select'))
    .some(select => select.labels?.[0]?.textContent.includes("When the PC sleeps") && !select.disabled));
  await named("Timer").click();
  await page.getByText("Customize session or preset", { exact: true }).click();
  await page.getByRole("textbox", { name: "Preset name" }).fill("Review");
  await page.getByRole("combobox", { name: "Timer mode" }).selectOption("countdown");
  await page.getByRole("spinbutton", { name: "Focus (min)" }).fill("2");
  await named("Save as new preset").click();
  await page.waitForFunction(() => document.querySelector("select")?.selectedOptions[0]?.text === "Review");
  await named("Start").click();
  await current.getByRole("heading", { name: "Review", exact: true }).waitFor();
  await named("Pause").waitFor();

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
}
