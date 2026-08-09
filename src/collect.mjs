import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";

const TARGET_URL =
  process.env.TARGET_URL ||
  "https://sports2.tippmixpro.hu/hu/v-sport/virtualis-labdarugas/86/virtualis-bl-3121214";

const collectedAt = new Date().toISOString();
let browser;
let record;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    locale: "hu-HU",
    timezoneId: "Europe/Budapest",
    viewport: { width: 1440, height: 1200 },
  });

  await page.goto(TARGET_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(12_000);

  for (const label of ["Elfogadom", "Összes elfogadása", "Rendben"]) {
    const button = page.getByRole("button", { name: label, exact: false }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {});
      await page.waitForTimeout(1_000);
      break;
    }
  }

  const visibleText = await page.locator("body").innerText({ timeout: 20_000 });
  const lines = visibleText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const links = await page.locator("a").evaluateAll((nodes) =>
    nodes
      .map((node) => ({
        text: (node.textContent || "").replace(/\s+/g, " ").trim(),
        href: node.href,
      }))
      .filter((item) => item.text || item.href)
      .slice(0, 500)
  );

  const title = await page.title();
  const finalUrl = page.url();
  const fingerprint = createHash("sha256")
    .update([title, finalUrl, ...lines].join("\n"))
    .digest("hex");

  record = {
    schemaVersion: 1,
    status: "ok",
    competition: "Virtuális BL",
    collectedAt,
    targetUrl: TARGET_URL,
    finalUrl,
    title,
    fingerprint,
    lineCount: lines.length,
    lines,
    links,
  };
} catch (error) {
  record = {
    schemaVersion: 1,
    status: "error",
    competition: "Virtuális BL",
    collectedAt,
    targetUrl: TARGET_URL,
    error: error instanceof Error ? error.message : String(error),
  };
} finally {
  await browser?.close().catch(() => {});
}

await mkdir("data", { recursive: true });
await writeFile("data/latest.json", JSON.stringify(record, null, 2) + "\n");
await appendFile("data/history.ndjson", JSON.stringify(record) + "\n");

let previousStatus = null;
try {
  previousStatus = JSON.parse(await readFile("data/status.json", "utf8"));
} catch {}

await writeFile(
  "data/status.json",
  JSON.stringify(
    {
      lastRunAt: collectedAt,
      status: record.status,
      samples:
        typeof previousStatus?.samples === "number"
          ? previousStatus.samples + 1
          : 1,
      latestFingerprint: record.fingerprint ?? null,
      latestError: record.error ?? null,
    },
    null,
    2
  ) + "\n"
);

console.log(
  record.status === "ok"
    ? `Collected ${record.lineCount} visible lines from ${record.finalUrl}`
    : `Collection error: ${record.error}`
);
