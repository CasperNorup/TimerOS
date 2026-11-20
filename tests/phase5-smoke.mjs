import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

export async function verifyPhaseFive(page, restore, options = {}) {
  const button = name => page.getByRole("button", { name, exact: true });
  const select = name => page.getByRole("combobox", { name, exact: true });
  const about = button("About TimerOS");
  const heading = name => page.getByRole("heading", { name, exact: true });
  const expand = label => page.getByText(label, { exact: true }).click();

  await about.press("Enter");
  const aboutDialog = page.getByRole("dialog", { name: "About TimerOS" });
  await aboutDialog.getByText("Version " + version, { exact: true }).waitFor();
  await aboutDialog.getByRole("link", { name: "CasperRNorup@gmail.com" }).waitFor();
  await button("Third-party licenses").click();
  const notices = page.getByLabel("Third-party notices");
  await notices.waitFor();
  assert.match(await notices.textContent(), /react-dom \S+/);
  if (options.native) assert.match(await notices.textContent(), /tauri 2\.12\.6/);
  await page.keyboard.press("Escape");
  await aboutDialog.waitFor({ state: "hidden" });
  assert.equal(await about.evaluate(node => node === document.activeElement), true);

  await expand("Mini timer");
  await select("Mini timer colors").selectOption("custom");
  await select("Mini timer background style").selectOption("gradient");
  await select("Gradient direction").selectOption("vertical");
  await select("Mini timer font").selectOption("Georgia");
  await select("Clock weight").selectOption("bold");
  await page.getByRole("slider", { name: /^Clock text size/ }).press("End");
  const pick = button("Pick Mini timer gradient end");
  await pick.press("Enter");
  const colorDialog = page.getByRole("dialog", { name: "Mini timer gradient end" });
  const hex = colorDialog.getByRole("textbox", { name: "Hex", exact: true });
  await hex.fill("#aa9877");
  await colorDialog.getByRole("textbox", { name: "Blue", exact: true }).fill("90");
  assert.equal(await hex.inputValue(), "#aa985a");
  await page.keyboard.press("Escape");
  await colorDialog.waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("textbox", { name: "Mini timer gradient end hex", exact: true }).inputValue(), "#295892");
  await pick.press("Enter");
  await hex.fill("#aa985a");
  await button("Apply").click();
  await page.waitForFunction(() => document.querySelector(".mini-preview")?.style
    .getPropertyValue("--mini-background").includes("to bottom, #111e35, #aa985a"));
  await page.waitForFunction(() => document.querySelector(".mini-preview")?.style.getPropertyValue("--clock-scale") === "1.4");

  await expand("Alerts and sound");
  await button("Pick Alert color").press("Enter");
  await page.getByRole("dialog", { name: "Alert color" }).getByRole("textbox", { name: "Hex", exact: true }).fill("#195fdf");
  await button("Apply").click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Alert color hex"]')?.value === "#195fdf");

  await button("History").click();
  const record = page.getByRole("checkbox", { name: "Record study history", exact: true });
  assert.equal(await record.isChecked(), false);
  await record.click();
  await page.waitForFunction(() => document.querySelector('.settings[aria-label="Study history settings"] input')?.checked);
  await button("Back to Settings").click();
  await button("Back to Timer").click();
  await select("Preset").selectOption("stopwatch");
  await page.getByRole("textbox", { name: "Study subject (optional)", exact: true }).fill("Ring theory");
  await button("Start").click();
  const session = page.getByRole("region", { name: "Current session" });
  await session.waitFor();
  await restore();
  await button("Settings").click();
  await heading("Settings").waitFor();
  await button("Back to Timer").click();
  await session.getByRole("heading", { name: "Stopwatch" }).waitFor();
  await button("Pause").waitFor();
  await page.waitForFunction(() => document.querySelector('.time[aria-label="Time elapsed"]')?.textContent !== "0:00");
  await button("Stop").click();
  await page.getByText(/^Session stopped/).waitFor();
  await button("Settings").click();
  await button("History").click();
  await page.getByText("Ring theory", { exact: true }).waitFor();
  await page.getByText("Partial", { exact: true }).waitFor();

  await button("Back to Settings").click();
  await select("App language").selectOption("da");
  await heading("Indstillinger").waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await heading("Timer").waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "da");
  await button("Indstillinger").click();
  await button("Historik").click();
  await heading("Historik").waitFor();
  await page.getByText("Seneste sessioner", { exact: true }).waitFor();
  await page.getByText("Delvis", { exact: true }).waitFor();
  await button("Ryd historik").click();
  await button("Annuller").click();
  assert.equal(await page.getByText("Ring theory", { exact: true }).count(), 1);
  await button("Tilbage til indstillinger").click();
  await button("Om TimerOS").click();
  await page.getByRole("dialog", { name: "Om TimerOS" }).waitFor();
  await button("Luk").click();
  await select("Appsprog").selectOption("en");
  await heading("Settings").waitFor();
  await verifySavedPhaseFive(page);
  await button("History").click();
  await record.click();
  await page.getByText("Turn on recording to save future sessions.", { exact: true }).waitFor();
  await button("Back to Settings").click();
  console.log("Verified About and offline notices, keyboard color editing, mini timer gradients and fonts, optional history, and persisted Danish and English UI.");
}

export async function verifySavedPhaseFive(page) {
  await page.getByText("Mini timer", { exact: true }).click();
  const select = name => page.getByRole("combobox", { name, exact: true });
  assert.equal(await select("Mini timer background style").inputValue(), "gradient");
  assert.equal(await select("Mini timer font").inputValue(), "Georgia");
  assert.equal(await select("Gradient direction").inputValue(), "vertical");
  assert.equal(await page.getByRole("textbox", { name: "Mini timer gradient end hex", exact: true }).inputValue(), "#aa985a");
  await page.getByText("Mini timer", { exact: true }).click();
  await page.getByText("Alerts and sound", { exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "Alert color hex", exact: true }).inputValue(), "#195fdf");
  await page.getByText("Alerts and sound", { exact: true }).click();
}
