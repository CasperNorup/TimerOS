import { strict as assert } from "node:assert";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const endpoint = "http://127.0.0.1:" + process.env.TIMEROS_WEBVIEW_PORT;
const deadline = Date.now() + 25_000;

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
  console.log("Verified installed TimerOS shell, Bloom playback, reduced motion, and saved appearance.");
} finally {
  await browser.close();
}
