import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME_URL = "https://www.instacart.com";
const PROFILE_DIR = process.env.INSTACART_PROFILE_DIR
  ?? process.env.INSTACART_AGENT_PROFILE_DIR
  ?? join(homedir(), ".nutriplan-instacart-chrome-profile");

let contextPromise = null;

async function hardenBrowserProfile() {
  const defaultProfile = join(PROFILE_DIR, "Default");
  const preferencesPath = join(defaultProfile, "Preferences");
  await mkdir(defaultProfile, { recursive: true });

  let preferences = {};
  try {
    preferences = JSON.parse(await readFile(preferencesPath, "utf8"));
  } catch {
    // Chromium creates this file on first launch.
  }

  preferences.credentials_enable_service = false;
  preferences.payments_integration_enabled = false;
  preferences.profile = {
    ...(preferences.profile ?? {}),
    password_manager_enabled: false,
  };
  preferences.autofill = {
    ...(preferences.autofill ?? {}),
    credit_card_enabled: false,
    profile_enabled: false,
  };
  await writeFile(preferencesPath, JSON.stringify(preferences), { mode: 0o600 });
}

export function browserIsRunning() {
  return Boolean(contextPromise);
}

export async function launchBrowser() {
  if (!contextPromise) {
    await hardenBrowserProfile();
    const launchPromise = chromium.launchPersistentContext(PROFILE_DIR, {
      acceptDownloads: false,
      args: [
        "--disable-save-password-bubble",
        "--disable-password-generation",
        "--disable-sync",
        "--disable-features=AutofillServerCommunication,PasswordManagerOnboarding,PasswordImport",
      ],
      headless: false,
      viewport: null,
    }).catch((error) => {
      if (contextPromise === launchPromise) contextPromise = null;
      throw new Error(`The NutriPlan browser could not start. Re-run the installer, then restart the agent. ${error.message}`);
    });
    contextPromise = launchPromise;
    launchPromise.then((context) => {
      context.on("close", () => {
        if (contextPromise === launchPromise) contextPromise = null;
      });
    }).catch(() => {});
  }

  const context = await contextPromise;
  let page = context.pages().find((candidate) => candidate.url().startsWith(HOME_URL))
    ?? context.pages()[0];
  if (!page) page = await context.newPage();
  if (!page.url().startsWith(HOME_URL)) {
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded" }).catch(() => {});
  }
  return { page };
}

export async function closeBrowser() {
  if (!contextPromise) return;
  const closingPromise = contextPromise;
  contextPromise = null;
  const context = await closingPromise;
  await context.close().catch(() => {});
}

export async function goHome(page) {
  const current = new URL(page.url());
  if (current.origin !== HOME_URL || current.pathname !== "/") {
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  }
  await page.waitForTimeout(1000);
}

const BADGE_LINE = /^\$|off$|no markups$|min$|mi$|^\d+\s+in\s+cart$/i;

function bestNameLine(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const candidates = lines.filter((line) => /[A-Za-z]{3,}/.test(line) && !BADGE_LINE.test(line));
  return (candidates[0] ?? lines[0] ?? "").trim();
}

export async function listStores(page) {
  const links = page.locator('a[href*="/store/"][href*="/storefront"]');
  const count = await links.count();
  const seen = new Map();
  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    const href = await link.getAttribute("href");
    const name = bestNameLine(await link.innerText());
    if (name && href && !seen.has(href)) seen.set(href, name);
  }
  return [...seen.entries()].map(([href, name]) => ({ href, name }));
}

export async function hasAuthModal(page) {
  return (await page.locator('[class*="AuthModal"]').count()) > 0
    || (await page.getByRole("dialog").getByText(/log in|sign up/i).count()) > 0;
}

export async function openStore(page, href) {
  const url = href.startsWith("http") ? href : `${HOME_URL}${href}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
}

export async function openCart(page) {
  const button = page.getByRole("button", { name: /View Cart/i }).first();
  const link = page.getByRole("link", { name: /View Cart|Cart/i }).first();
  const target = await button.count() ? button : link;
  if (await target.count()) {
    await target.click();
    await page.waitForTimeout(800);
  }
}

const ADD_BUTTON_NAME = /^Add\b/;

async function inStoreSearch(page, query) {
  if (await hasAuthModal(page)) {
    throw new Error("Instacart needs your login. Sign in in the private browser window, then retry this cart.");
  }

  const box = page.getByPlaceholder(/Search/i).first();
  if (!(await box.count())) throw new Error("Instacart search is unavailable on this store page.");
  await box.click();
  await box.fill("");
  await box.pressSequentially(query, { delay: 20 });
  await page.keyboard.press("Enter");

  await Promise.race([
    page.getByText(/^No results for/i).first().waitFor({ timeout: 10000 }),
    page.getByRole("button", { name: ADD_BUTTON_NAME }).first().waitFor({ timeout: 10000 }),
  ]).catch(() => {});
  await page.waitForTimeout(300);
}

export async function searchAndAdd(page, { query, quantity = 1 }) {
  await inStoreSearch(page, query);

  if (await page.getByText(/^No results for/i).count()) {
    return { query, added: false, reason: "no results" };
  }

  const addButton = page.getByRole("button", { name: ADD_BUTTON_NAME }).first();
  if (!(await addButton.count())) {
    return { query, added: false, reason: "no results" };
  }

  const accessibleName = await addButton.evaluate((element) => (
    element.getAttribute("aria-label") || element.textContent || ""
  ));
  const name = accessibleName.replace(/^Add\s+/i, "").trim() || query;

  await addButton.click();
  await page.waitForTimeout(500);

  for (let index = 1; index < quantity; index += 1) {
    const plus = page.getByRole("button", { name: /^(Increase quantity|\+)$/i }).first();
    if (!(await plus.count())) break;
    await plus.click();
    await page.waitForTimeout(300);
  }

  return { query, added: true, matchedName: name, quantity };
}
