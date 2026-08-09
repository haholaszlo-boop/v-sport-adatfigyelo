import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";

const TARGET_URL =
  process.env.TARGET_URL ||
  "https://sports2.tippmixpro.hu/hu/v-sport/virtualis-labdarugas/86/virtualis-bl-3121214";
const SAMPLE_COUNT = Math.max(1, Number(process.env.SAMPLE_COUNT || 1));
const SAMPLE_INTERVAL_MS = Math.max(
  0,
  Number(process.env.SAMPLE_INTERVAL_SECONDS || 0) * 1000
);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await mkdir("data", { recursive: true });
let browser;
const records = [];

async function collect(page) {
  const collectedAt = new Date().toISOString();

  try {
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
        .slice(0, 750)
    );

    const eventIds = [
      ...new Set(
        links
          .flatMap(({ href }) => href.match(/\d{10,}/g) || [])
          .filter(Boolean)
      ),
    ];
    const title = await page.title();
    const finalUrl = page.url();
    const fingerprint = createHash("sha256")
      .update([title, finalUrl, ...lines].join("\n"))
      .digest("hex");

    return {
      schemaVersion: 2,
      status: "ok",
      competition: "Virtuális BL",
      collectedAt,
      targetUrl: TARGET_URL,
      finalUrl,
      title,
      fingerprint,
      eventIds,
      lineCount: lines.length,
      lines,
      links,
    };
  } catch (error) {
    return {
      schemaVersion: 2,
      status: "error",
      competition: "Virtuális BL",
      collectedAt,
      targetUrl: TARGET_URL,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    locale: "hu-HU",
    timezoneId: "Europe/Budapest",
    viewport: { width: 1440, height: 1200 },
  });
  const page = await context.newPage();

  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    if (index > 0) await delay(SAMPLE_INTERVAL_MS);
    const record = await collect(page);
    records.push(record);
    await appendFile("data/history.ndjson", JSON.stringify(record) + "\n");
    console.log(
      record.status === "ok"
        ? `Sample ${index + 1}/${SAMPLE_COUNT}: ${record.lineCount} lines, ${record.eventIds.length} event IDs`
        : `Sample ${index + 1}/${SAMPLE_COUNT} error: ${record.error}`
    );
  }
} finally {
  await browser?.close().catch(() => {});
}

const latest = records.at(-1);
await writeFile("data/latest.json", JSON.stringify(latest, null, 2) + "\n");

let previousStatus = null;
try {
  previousStatus = JSON.parse(await readFile("data/status.json", "utf8"));
} catch {}

await writeFile(
  "data/status.json",
  JSON.stringify(
    {
      lastRunAt: latest?.collectedAt ?? new Date().toISOString(),
      status: latest?.status ?? "error",
      samples:
        (typeof previousStatus?.samples === "number"
          ? previousStatus.samples
          : 0) + records.length,
      latestFingerprint: latest?.fingerprint ?? null,
      latestEventIds: latest?.eventIds ?? [],
      latestError: latest?.error ?? null,
      schedule: {
        githubMinutes: 5,
        samplesPerRun: SAMPLE_COUNT,
        secondsBetweenSamples: SAMPLE_INTERVAL_MS / 1000,
      },
    },
    null,
    2
  ) + "\n"
);
