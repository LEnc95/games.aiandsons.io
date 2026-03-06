import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUTPUT_DIR = path.join(process.cwd(), "output", "web-game", "report-generator-e2e");
const SUMMARY_PATH = path.join(OUTPUT_DIR, "summary.json");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
    const fallback = path.join(
      codexHome,
      "skills",
      "develop-web-game",
      "node_modules",
      "playwright",
      "index.mjs",
    );
    return import(pathToFileURL(fallback).href);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function resetState(page) {
  await page.evaluate(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith("cadegames:v1:")) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  });
}

async function main() {
  ensureDir(OUTPUT_DIR);
  const baseUrl = process.argv[2] || "http://127.0.0.1:4173";
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  await page.addInitScript(() => {
    const fakePopup = {
      document: {
        open() {},
        write() {},
        close() {},
      },
      focus() {},
      print() {},
      close() {},
    };
    window.open = () => fakePopup;
  });

  const consoleErrors = [];
  page.on("pageerror", (err) => {
    consoleErrors.push({ type: "pageerror", text: String(err) });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({ type: "console.error", text: msg.text() });
    }
  });

  const summary = {
    baseUrl,
    checks: [],
    screenshots: [],
    consoleErrors: [],
    success: false,
  };

  try {
    await page.goto(`${baseUrl}/teacher/`, { waitUntil: "networkidle" });
    await resetState(page);
    await page.evaluate(() => {
      const now = Date.now();
      localStorage.setItem("cadegames:v1:entitlements", JSON.stringify({
        familyPremium: false,
        schoolLicense: true,
        checkout: {
          status: "idle",
          planId: "",
          token: "",
          startedAt: 0,
          completedAt: 0,
        },
      }));
      localStorage.setItem("cadegames:v1:classroom", JSON.stringify({
        enabled: true,
        teacherPin: "",
        shopDisabledDuringClass: true,
        gameWhitelist: ["pong", "tictactoe"],
        assignment: {
          bundleId: "focus-pack",
          assignedAt: now - 2_000_000,
          completedAt: 0,
        },
        report: {
          assignmentCompletions: [
            {
              bundleId: "starter-pack",
              assignedAt: now - 8_000_000,
              completedAt: now - 7_000_000,
              dayKey: "2026-03-04",
              weekKey: "2026-03-02",
            },
            {
              bundleId: "focus-pack",
              assignedAt: now - 5_000_000,
              completedAt: now - 4_000_000,
              dayKey: "2026-03-05",
              weekKey: "2026-03-02",
            },
          ],
          sessionStats: {
            totalSessions: 16,
            byGame: {
              pong: 7,
              tictactoe: 4,
              flappy: 3,
              memory: 2,
            },
          },
        },
        session: {
          active: false,
          startsAt: now - 1_000_000,
          endsAt: now - 500_000,
          durationMinutes: 30,
        },
      }));
    });
    await page.reload({ waitUntil: "networkidle" });

    const gateState = await page.evaluate(() => {
      const license = document.getElementById("licenseValue")?.textContent?.trim() || "";
      const reportDisabled = Boolean(document.getElementById("reportBtn")?.disabled);
      const csvDisabled = Boolean(document.getElementById("exportCsvBtn")?.disabled);
      const pdfDisabled = Boolean(document.getElementById("exportPdfBtn")?.disabled);
      return {
        license,
        reportDisabled,
        csvDisabled,
        pdfDisabled,
      };
    });
    assert(gateState.license === "Active", "Expected school license to be active on teacher dashboard.");
    assert(gateState.reportDisabled === false, "Expected report generation button to be enabled.");
    summary.checks.push({ name: "report_tool_gate", pass: true, data: gateState });

    await page.click("#reportBtn");
    const generatedState = await page.evaluate(() => {
      const previewText = document.getElementById("reportPreview")?.textContent || "";
      const payload = (() => {
        try {
          return JSON.parse(previewText);
        } catch {
          return null;
        }
      })();
      return {
        previewText,
        totalSessions: payload?.totalPlaySessions || 0,
        assignmentCompletionCount: payload?.assignmentCompletionCount || 0,
        topGameSlug: payload?.topGames?.[0]?.slug || "",
      };
    });
    assert(generatedState.totalSessions === 16, "Expected total play sessions to match seeded aggregate data.");
    assert(generatedState.assignmentCompletionCount === 2, "Expected assignment completion count from seeded data.");
    assert(generatedState.topGameSlug === "pong", "Expected top game slug ordering by session count.");
    summary.checks.push({ name: "report_generation_data", pass: true, data: generatedState });

    const reportShot = path.join(OUTPUT_DIR, "teacher-report-generated.png");
    await page.locator("#reportPreview").screenshot({ path: reportShot });
    summary.screenshots.push(reportShot);

    await page.click("#exportCsvBtn");
    const csvState = await page.evaluate(() => {
      const notice = document.getElementById("actionNotice")?.textContent?.trim() || "";
      const stateText = window.render_game_to_text ? window.render_game_to_text() : "{}";
      let parsed = {};
      try {
        parsed = JSON.parse(stateText);
      } catch {
        parsed = {};
      }
      return {
        notice,
        lastReportExport: parsed.lastReportExport || "",
      };
    });
    assert(csvState.notice.includes("CSV export downloaded"), "Expected CSV export notice.");
    assert(csvState.lastReportExport === "csv", "Expected render state to record csv export.");
    summary.checks.push({ name: "report_csv_export", pass: true, data: csvState });

    await page.click("#exportPdfBtn");
    const pdfState = await page.evaluate(() => {
      const notice = document.getElementById("actionNotice")?.textContent?.trim() || "";
      const stateText = window.render_game_to_text ? window.render_game_to_text() : "{}";
      let parsed = {};
      try {
        parsed = JSON.parse(stateText);
      } catch {
        parsed = {};
      }
      return {
        notice,
        lastReportExport: parsed.lastReportExport || "",
      };
    });
    assert(pdfState.notice.includes("PDF export opened"), "Expected PDF export notice.");
    assert(pdfState.lastReportExport === "pdf", "Expected render state to record pdf export.");
    summary.checks.push({ name: "report_pdf_export", pass: true, data: pdfState });

    summary.consoleErrors = consoleErrors;
    summary.success = consoleErrors.length === 0;
    if (!summary.success) {
      throw new Error("Console errors were captured during report generator smoke test.");
    }
  } finally {
    fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    await browser.close();
  }

  console.log(`Report generator smoke passed. Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
