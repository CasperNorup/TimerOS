import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const savedImage = {
  name: "study-background.png", mimeType: "image/png",
  buffer: readFileSync(new URL("../src/assets/branding/TimerOS-app-icon-transparent.png", import.meta.url)),
};

function fileField(page) {
  return page.getByLabel("Choose local image", { exact: true });
}

async function expectStyle(page, property, value) {
  await page.waitForFunction(([key, expected]) =>
    document.documentElement.style.getPropertyValue(key).includes(expected), [property, value]);
}

export async function verifySavedAppearance(page) {
  await expectStyle(page, "--surface", "#233344");
  await expectStyle(page, "--background-image", "blob:");
  await expectStyle(page, "--background-size", "contain");
  await expectStyle(page, "--background-position", "100% 50%");
  assert.equal(await page.getByRole("combobox", { name: "Splash screen", exact: true }).inputValue(), "Signal");
  assert.equal(await page.getByRole("combobox", { name: "Display mode", exact: true }).inputValue(), "Dark");
  assert.equal(await page.locator(".brand img").evaluate(image => image.getBoundingClientRect().width), 34);
}

export async function verifyAppearance(page, heading, named) {
  const select = name => page.getByRole("combobox", { name, exact: true });
  const toggle = label => page.getByText(label, { exact: true }).click();
  const root = page.locator("html");
  const mode = select("Display mode");

  await named("Settings").click();
  await mode.selectOption("Light");
  await page.waitForFunction(() => document.documentElement.dataset.appearance === "light");
  const themes = page.getByText("Themes and palettes", { exact: true });
  await themes.press("Space");
  await select("Theme").selectOption("forest");
  await expectStyle(page, "--surface", "#fbfefa");
  await named("Duplicate theme").press("Enter");
  const name = page.getByRole("textbox", { name: "Theme name", exact: true });
  await name.fill("Study Palette");
  await named("Save theme name").press("Enter");
  await page.waitForFunction(() => [...document.querySelectorAll("select")]
    .some(element => element.selectedOptions[0]?.text === "Study Palette"));
  await select("Palette variant").selectOption("dark");
  const panelColor = page.getByRole("textbox", { name: "Panel background hex", exact: true });
  await panelColor.fill("#233344");
  await panelColor.press("Enter");
  await page.waitForFunction(() => document.querySelector(".palette-preview")?.style.getPropertyValue("--surface") === "#233344");
  await mode.selectOption("Dark");
  await expectStyle(page, "--surface", "#233344");
  assert.equal(await root.getAttribute("data-appearance"), "dark");

  await toggle("Background");
  const background = select("Background type");
  await background.selectOption("solid");
  await expectStyle(page, "--background-color", "#e8eef8");
  await background.selectOption("gradient");
  await expectStyle(page, "--background-image", "linear-gradient(");
  await background.selectOption("bundled");
  await expectStyle(page, "--background-image", "forest-mist");
  await select("Bundled image").selectOption("coast");
  await expectStyle(page, "--background-image", "danish-coast");
  await background.selectOption("local");
  await fileField(page).setInputFiles({ ...savedImage, buffer: Buffer.from("invalid png") });
  await page.getByRole("alert").getByText("This image could not be opened.").waitFor();
  await fileField(page).setInputFiles(savedImage);
  await expectStyle(page, "--background-image", "blob:");
  await select("Image fit").selectOption("contain");
  await page.getByRole("slider", { name: /^Horizontal position/ }).press("End");
  await expectStyle(page, "--background-position", "100% 50%");
  await expectStyle(page, "--background-size", "contain");

  await toggle("Text and spacing");
  await select("Body font").selectOption("Arial");
  await select("Heading font").selectOption("Georgia");
  await page.getByRole("slider", { name: /^Text size/ }).press("End");
  await select("Line spacing").selectOption("1.7");
  await select("Layout density").selectOption("Compact");
  await expectStyle(page, "--body-font", "Arial");
  await expectStyle(page, "--heading-font", "Georgia");
  await expectStyle(page, "--text-size", "130%");
  await expectStyle(page, "--line-height", "1.7");
  await expectStyle(page, "--density", "0.82");

  await toggle("Mini timer");
  assert.equal(await select("Mini timer colors").inputValue(), "custom");
  await select("Mini timer colors").selectOption("theme");
  await page.waitForFunction(() => document.querySelector(".mini-preview")?.style.getPropertyValue("--mini-color") === "#233344");
  await select("Mini timer colors").selectOption("custom");
  await page.waitForFunction(() => document.querySelector(".mini-preview")?.style.getPropertyValue("--mini-color") === "#111e35");
  await select("Mini timer colors").selectOption("theme");
  await page.waitForFunction(() => document.querySelector(".mini-preview")?.style.getPropertyValue("--mini-color") === "#233344");

  const splash = select("Splash screen");
  const splashRequests = [];
  const observe = request => {
    if (request.url().includes("TimerOS-splash-")) splashRequests.push(request.url());
  };
  page.on("request", observe);
  try {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const choice of ["Origami", "Signal", "Off"]) {
      await splash.selectOption(choice);
      await page.waitForFunction(expected => [...document.querySelectorAll(".appearance-settings select")]
        .some(element => element.labels[0]?.textContent.startsWith("Splash screen") && element.value === expected), choice);
      splashRequests.length = 0;
      await page.reload({ waitUntil: "domcontentloaded" });
      if (choice !== "Off") await page.locator(".startup-animation.is-playing svg").waitFor({ timeout: 8_000 });
      await heading.waitFor({ timeout: 12_000 });
      assert.equal(splashRequests.some(request => request.includes(choice.toLowerCase())), choice !== "Off");
      if (choice === "Off") assert.equal(splashRequests.length, 0);
      await named("Settings").click();
    }
    assert.equal(await splash.inputValue(), "Off");
    await splash.selectOption("Signal");
    await verifySavedAppearance(page);
  } finally {
    page.off("request", observe);
    await page.emulateMedia({ reducedMotion: "reduce" });
  }

  console.log("Verified keyboard theme editing, bundled and imported backgrounds, framing, typography, mini timer theme, splash choices and saved appearance.");
}
