"use strict";

const fs     = require("fs");
const http   = require("http");
const path   = require("path");
const crypto = require("crypto");

const REPO_ROOT  = path.resolve(__dirname, "..");
const ENV_PATH   = path.join(__dirname, ".env");
const DATA_DIR   = path.join(__dirname, "data");
const DB_PATH    = path.join(DATA_DIR, "dev-db.json");
const PORT       = Number(process.env.RESUMEAI_PORT || 3740);

// ── Env ────────────────────────────────────────────────────
function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  fs.readFileSync(ENV_PATH, "utf8").split("\n").forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith("#")) return;
    const sep = t.indexOf("=");
    if (sep <= 0) return;
    const k = t.slice(0, sep).trim();
    const v = t.slice(sep + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  });
}
loadEnv();

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

// ── DB ────────────────────────────────────────────────────
function createDb() {
  return {
    users: [],
    sessions: {},
    resume_sessions: {},
    metadata: { created_at: new Date().toISOString() },
  };
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH))
    fs.writeFileSync(DB_PATH, JSON.stringify(createDb(), null, 2) + "\n", "utf8");
}

function loadDb() {
  ensureDb();
  try {
    const raw = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    return { ...createDb(), ...raw };
  } catch (_) { return createDb(); }
}

function saveDb() {
  db.metadata.updated_at = new Date().toISOString();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2) + "\n", "utf8");
}

let db = loadDb();

// ── Helpers ───────────────────────────────────────────────
const nowIso   = () => new Date().toISOString();
const randomId = (p = "id") => `${p}_${crypto.randomBytes(8).toString("hex")}`;

function parseCookies(header) {
  const map = {};
  if (!header) return map;
  header.split(";").forEach((p) => {
    const [k, ...v] = p.split("=");
    if (k) map[k.trim()] = decodeURIComponent(v.join("=").trim());
  });
  return map;
}

function setCookie(res, name, value, opts = {}) {
  let c = `${name}=${encodeURIComponent(value)}`;
  if (opts.path) c += `; Path=${opts.path}`;
  if (opts.httpOnly) c += "; HttpOnly";
  if (opts.maxAge != null) c += `; Max-Age=${opts.maxAge}`;
  const existing = res.getHeader("Set-Cookie") || [];
  res.setHeader("Set-Cookie", [...(Array.isArray(existing) ? existing : [existing]), c]);
}

function json(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(body) });
  res.end(body);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (c) => { raw += c; if (raw.length > 2e6) reject(new Error("Payload too large.")); });
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch (_) { resolve({}); } });
    req.on("error", reject);
  });
}

function getAuth(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token   = cookies["resumeai_session"];
  if (!token) return { user: null, session: null };
  const session = db.sessions[token];
  if (!session) return { user: null, session: null };
  const user = db.users.find((u) => u.id === session.user_id) || null;
  return { user, session, token };
}

function upsertUser(email) {
  let user = db.users.find((u) => u.email === email);
  if (!user) {
    user = { id: randomId("usr"), email, created_at: nowIso(), plan_tier: "free", subscription_status: null };
    db.users.push(user);
  }
  return user;
}

// ── Stripe ────────────────────────────────────────────────
async function maybeCreateStripeCheckout(user, tier) {
  const sk  = String(process.env.STRIPE_SECRET_KEY || "").trim();
  const pid = String(process.env.STRIPE_PRICE_ID   || "").trim();
  if (!sk || !pid) {
    return { id: `sim_${Date.now()}`, url: "/checkout/?simulated=1", mode: "simulated" };
  }
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("success_url", `http://localhost:${PORT}/settings/?checkout=success`);
  params.set("cancel_url",  `http://localhost:${PORT}/pricing/`);
  params.set("line_items[0][price]",    pid);
  params.set("line_items[0][quantity]", "1");
  if (user.email) params.set("customer_email", user.email);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${sk}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Stripe error ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// ── Claude analysis ───────────────────────────────────────
async function callClaude(systemPrompt, userMessage) {
  const apiKey = String(process.env.ANTHROPIC_API_KEY || "").trim();
  if (!apiKey) return null; // offline mode

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || null;
}

function simulateAnalysis(resumeText, targetRole, targetLevel, jd) {
  return {
    fit_score: 72,
    strengths: [
      "Strong technical ownership language",
      "Clear progression and tenure",
      "Relevant domain experience",
    ],
    gaps: [
      "Missing scale metrics (users, requests/sec)",
      "No explicit team scope or leadership evidence",
      "JD keyword coverage needs improvement",
    ],
    ats_flags: [
      "Ensure section headings match standard labels (Experience, Education, Skills)",
    ],
    structured_questions: [
      { id: "q1", text: "What is the largest scale system you have owned or built? Include numbers (users, requests/sec, data volume) if available.", hint: "Be specific — team size, traffic, storage scale, uptime requirements." },
      { id: "q2", text: "What is your highest-impact project in the last 2 years? What was the measurable outcome?", hint: "Focus on the result first, then describe what you built." },
      { id: "q3", text: "Describe a significant production issue you diagnosed and fixed. What was the impact?", hint: "Include time-to-detect, time-to-resolve, and any systemic fixes." },
      { id: "q4", text: "What technical decisions have you led or strongly influenced? What tradeoffs did you weigh?", hint: "Design reviews, architecture choices, build-vs-buy, tech selection." },
      { id: "q5", text: "Any missing metrics you can fill in now? (latency improvements, cost savings, revenue impact, team size led)", hint: "Even rough numbers are better than none." },
    ],
  };
}

// ── API handlers ──────────────────────────────────────────
async function handleApi(req, res, url) {
  // Health
  if (req.method === "GET" && url.pathname === "/api/health") {
    return json(res, 200, { ok: true, ts: nowIso() });
  }

  // Session
  if (req.method === "GET" && url.pathname === "/api/session") {
    const auth = getAuth(req);
    return json(res, 200, { user: auth.user || null });
  }

  // Dev sign-in
  if (req.method === "POST" && url.pathname === "/api/auth/dev-signin") {
    const body  = await parseBody(req);
    const email = String(body.email || "tester@resumeai.local").trim();
    const user  = upsertUser(email);
    const token = randomId("sess");
    db.sessions[token] = { user_id: user.id, created_at: nowIso() };
    saveDb();
    setCookie(res, "resumeai_session", token, { path: "/", httpOnly: true, maxAge: 86400 * 30 });
    return json(res, 200, { ok: true, user });
  }

  // Sign out
  if (req.method === "POST" && url.pathname === "/api/auth/signout") {
    const auth = getAuth(req);
    if (auth.token) delete db.sessions[auth.token];
    saveDb();
    setCookie(res, "resumeai_session", "", { path: "/", httpOnly: true, maxAge: 0 });
    return json(res, 200, { ok: true });
  }

  // Resume upload (store text)
  if (req.method === "POST" && url.pathname === "/api/resume/upload") {
    const body = await parseBody(req);
    const sid  = randomId("rsess");
    db.resume_sessions[sid] = {
      resume_text: body.text || "",
      resume_filename: body.filename || "resume.txt",
      created_at: nowIso(),
    };
    saveDb();
    return json(res, 200, { ok: true, session_id: sid });
  }

  // Resume analyze
  if (req.method === "POST" && url.pathname === "/api/resume/analyze") {
    const body = await parseBody(req);
    const { resume_text, target_role, target_level, job_description, variant_family } = body;

    let analysis;
    try {
      const systemPrompt = `You are an expert resume analyst applying three review lenses: hiring-manager, recruiter, and ATS. Return ONLY valid JSON matching this schema: { "fit_score": number 0-100, "strengths": string[], "gaps": string[], "ats_flags": string[], "structured_questions": [{ "id": string, "text": string, "hint": string }] }. Be specific and honest. Do not inflate scores.`;
      const userMessage  = `Resume:\n${resume_text}\n\nTarget role: ${target_role} (${target_level})\nVariant family: ${variant_family || "general"}\n${job_description ? `\nJob description:\n${job_description}` : ""}`;
      const raw = await callClaude(systemPrompt, userMessage);
      if (raw) {
        const match = raw.match(/\{[\s\S]*\}/);
        analysis = match ? JSON.parse(match[0]) : simulateAnalysis(resume_text, target_role, target_level, job_description);
      } else {
        analysis = simulateAnalysis(resume_text, target_role, target_level, job_description);
      }
    } catch (_) {
      analysis = simulateAnalysis(resume_text, target_role, target_level, job_description);
    }

    return json(res, 200, { ok: true, analysis });
  }

  // Build variant
  if (req.method === "POST" && url.pathname === "/api/resume/build") {
    const body = await parseBody(req);
    const { resume_text, target_role, target_level, job_description, variant_family, analysis, answers } = body;

    let variant;
    try {
      const answersText = Object.entries(answers || {}).map(([k, v]) => `Q${k}: ${v}`).join("\n");
      const systemPrompt = `You are an expert resume writer. Rewrite the provided resume as a role-targeted LaTeX document. Return ONLY the complete LaTeX source code, nothing else. Use standard resume LaTeX conventions. Apply impact-first bullet rewrites. Do not fabricate metrics not present in the original or user answers.`;
      const userMessage  = `Original resume:\n${resume_text}\n\nTarget: ${target_role} (${target_level})\nVariant family: ${variant_family || "general"}\n${job_description ? `\nJob description:\n${job_description}` : ""}\n\nUser answers to gap questions:\n${answersText}\n\nAnalysis gaps to address:\n${(analysis?.gaps || []).join(", ")}`;
      const raw = await callClaude(systemPrompt, userMessage);
      variant = { latex: raw || "% Connect ANTHROPIC_API_KEY to generate LaTeX output.\n", simulated: !raw };
    } catch (_) {
      variant = { latex: "% Variant generation failed. Check ANTHROPIC_API_KEY.\n", simulated: true };
    }

    return json(res, 200, { ok: true, variant });
  }

  // Stripe checkout session
  if (req.method === "POST" && url.pathname === "/api/subscription/checkout-session") {
    const body = await parseBody(req);
    const auth = getAuth(req);
    const user = auth.user || upsertUser("guest@resumeai.local");
    user.subscription_status = "checkout_started";
    saveDb();
    try {
      const checkout = await maybeCreateStripeCheckout(user, body.tier || "pro");
      return json(res, 200, { ok: true, checkout });
    } catch (err) {
      return json(res, 502, { error: err.message });
    }
  }

  // Stripe webhook
  if (req.method === "POST" && url.pathname === "/api/stripe/webhook") {
    const body = await parseBody(req);
    const type = body.type;
    if (type === "checkout.session.completed") {
      const email = body.data?.object?.customer_email;
      if (email) {
        const user = upsertUser(email);
        user.subscription_status = "active";
        user.plan_tier = "pro";
        saveDb();
      }
    }
    return json(res, 200, { received: true });
  }

  return json(res, 404, { error: "Not found" });
}

// ── Static file server ────────────────────────────────────
function serveStatic(req, res, urlPath) {
  // Normalize trailing slash → /index.html
  let fsPath = urlPath.endsWith("/")
    ? path.join(REPO_ROOT, urlPath, "index.html")
    : path.join(REPO_ROOT, urlPath);

  // Prevent directory traversal
  if (!fsPath.startsWith(REPO_ROOT)) return json(res, 403, { error: "Forbidden" });

  if (!fs.existsSync(fsPath)) {
    // Try appending /index.html
    const withIndex = fsPath + "/index.html";
    if (fs.existsSync(withIndex)) {
      fsPath = withIndex;
    } else {
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end("<h1>404 Not Found</h1>");
      return;
    }
  }

  const ext  = path.extname(fsPath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  const content = fs.readFileSync(fsPath);
  res.writeHead(200, { "Content-Type": mime, "Content-Length": content.length });
  res.end(content);
}

// ── Server ────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS for local dev
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url.pathname);
    }
  } catch (err) {
    console.error(err);
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`ResumeAI running → http://localhost:${PORT}`);
  console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "set ✓" : "not set (simulated mode)"}`);
  console.log(`  STRIPE_SECRET_KEY: ${process.env.STRIPE_SECRET_KEY ? "set ✓" : "not set (simulated mode)"}`);
});
