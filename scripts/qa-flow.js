"use strict";
/**
 * ResumeAI — Puppeteer flow QA
 * Runs the full funnel end-to-end and reports pass/fail per step.
 *
 * Usage:
 *   node scripts/qa-flow.js
 *
 * Requires the backend to be running:
 *   node backend/server.js
 */

const puppeteer = require("puppeteer");

const BASE = process.env.RESUMEAI_QA_BASE_URL || "http://localhost:3740";

const SAMPLE_RESUME = `
John Doe
john@example.com | github.com/johndoe | San Francisco, CA

EXPERIENCE

Senior Software Engineer — Acme Corp (2021–present)
- Led migration of monolithic payment service to microservices, reducing p99 latency by 35%
- Owned on-call rotation for 3 critical services serving 2M daily active users
- Mentored 4 junior engineers through code reviews and design reviews

Software Engineer — Beta Inc (2018–2021)
- Built real-time analytics pipeline processing 500K events/day using Kafka + Flink
- Reduced infrastructure cost by $120K/year by right-sizing EC2 fleet

SKILLS
Go, Python, TypeScript, Kubernetes, Kafka, PostgreSQL, Redis, AWS

EDUCATION
B.S. Computer Science — State University, 2018
`.trim();

async function step(page, label, fn) {
  process.stdout.write(`  ${label}… `);
  try {
    await fn(page);
    console.log("✓");
    return true;
  } catch (err) {
    console.log(`✗  (${err.message})`);
    return false;
  }
}

async function run() {
  console.log(`\nResumeAI QA Flow — ${BASE}\n`);

  const browser = await puppeteer.launch({ headless: "new" });
  const page    = await browser.newPage();
  page.setDefaultTimeout(10000);

  let passed = 0;
  let total  = 0;

  async function check(label, fn) {
    total++;
    const ok = await step(page, label, fn);
    if (ok) passed++;
  }

  // 1. Landing page
  await check("Landing page loads", async (p) => {
    await p.goto(`${BASE}/landing/`);
    await p.waitForSelector(".hero-headline");
    const text = await p.$eval(".hero-headline", (el) => el.textContent);
    if (!text.includes("resume")) throw new Error("Headline missing 'resume'");
  });

  // 2. Upload page
  await check("Upload page loads", async (p) => {
    await p.goto(`${BASE}/upload/`);
    await p.waitForSelector(".upload-zone");
  });

  // 3. Paste resume text and continue
  await check("Paste resume text and continue", async (p) => {
    await p.goto(`${BASE}/upload/`);
    // Show paste section
    await p.click("#togglePaste");
    await p.waitForSelector("#pasteInput", { visible: true });
    await p.type("#pasteInput", SAMPLE_RESUME);
    await p.waitForFunction(() => !document.getElementById("continueBtn").disabled);
    await Promise.all([
      p.waitForNavigation({ waitUntil: "domcontentloaded" }),
      p.click("#continueBtn"),
    ]);
    if (!p.url().includes("/target/")) throw new Error(`Expected /target/, got ${p.url()}`);
  });

  // 4. Target role page
  await check("Target role form and continue", async (p) => {
    await p.waitForSelector("#roleInput");
    await p.type("#roleInput", "Senior Software Engineer");
    await p.select("#levelSelect", "senior");
    await p.waitForFunction(() => !document.getElementById("continueBtn").disabled);
    await Promise.all([
      p.waitForNavigation({ waitUntil: "domcontentloaded" }),
      p.click("#continueBtn"),
    ]);
    if (!p.url().includes("/questions/")) throw new Error(`Expected /questions/, got ${p.url()}`);
  });

  // 5. Questions page
  await check("Questions page loads and build fires", async (p) => {
    await p.waitForSelector(".question-card");
    // Fill in first answer
    const firstTextarea = await p.$(".question-card textarea");
    if (!firstTextarea) throw new Error("No answer textarea found");
    await firstTextarea.type("I owned a distributed data pipeline handling 500K events/day.");
    await Promise.all([
      p.waitForNavigation({ waitUntil: "domcontentloaded" }),
      p.click("#buildBtn"),
    ]);
    if (!p.url().includes("/results/")) throw new Error(`Expected /results/, got ${p.url()}`);
  });

  // 6. Results page
  await check("Results page shows score and download buttons", async (p) => {
    await p.waitForSelector(".score-ring");
    await p.waitForSelector("#downloadLatex");
    const roleText = await p.$eval("#resultsRole", (el) => el.textContent);
    if (!roleText || roleText === "—") throw new Error("Role not displayed");
  });

  // 7. Pricing page
  await check("Pricing page loads", async (p) => {
    await p.goto(`${BASE}/pricing/`);
    await p.waitForSelector(".plan-card");
    const plans = await p.$$(".plan-card");
    if (plans.length < 2) throw new Error("Expected at least 2 plan cards");
  });

  // 8. Login page
  await check("Login page loads", async (p) => {
    await p.goto(`${BASE}/login/`);
    await p.waitForSelector("#emailInput");
  });

  await browser.close();

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Result: ${passed}/${total} passed\n`);
  process.exit(passed === total ? 0 : 1);
}

run().catch((err) => {
  console.error("\nFatal:", err.message);
  process.exit(1);
});
