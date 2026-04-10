"use strict";

const fs             = require("fs");
const http           = require("http");
const path           = require("path");
const crypto         = require("crypto");
const os             = require("os");
const { execSync }   = require("child_process");

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
async function callClaude(systemPrompt, userMessage, maxTokens = 4096) {
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
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}`);
  const data = await res.json();
  return data.content?.[0]?.text || null;
}

// ── LaTeX template ────────────────────────────────────────
const LATEX_TEMPLATE = `
% ── ResumeAI canonical template ──
% Requirements: pdflatex + texlive-base
% DO NOT change margins or font size — they are calibrated for full-page fill.
\\documentclass[10.5pt,letterpaper]{article}
\\usepackage[top=0.55in,bottom=0.55in,left=0.6in,right=0.6in]{geometry}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{titlesec}
\\usepackage{microtype}

\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0pt}

\\titleformat{\\section}{\\bfseries\\normalsize\\uppercase}{}{0em}{}[\\vspace{-5pt}\\rule{\\linewidth}{0.5pt}]
\\titlespacing*{\\section}{0pt}{9pt}{4pt}

\\setlist[itemize]{noitemsep,topsep=1pt,parsep=0pt,partopsep=0pt,leftmargin=1.2em,label=\\textbullet}

\\begin{document}

% ════ HEADER ════
\\begin{center}
  {\\LARGE \\textbf{FULL NAME}} \\\\[3pt]
  {\\small City, State $\\bullet$ \\href{mailto:email@example.com}{email@example.com} $\\bullet$ (555) 555-5555 $\\bullet$ \\href{https://linkedin.com/in/handle}{linkedin.com/in/handle}}
\\end{center}

\\vspace{3pt}

% ════ SUMMARY ════
\\section{Summary}
2--3 sentence role-targeted summary. Sentence 1: who you are and what you build. Sentence 2: your specific technical or domain edge. Sentence 3 (optional): what you are optimizing for in your next role. No buzzwords. No first-person pronouns.

% ════ EXPERIENCE ════
\\section{Experience}

\\noindent\\textbf{Company Name} \\hfill City, State \\\\
\\textit{Job Title} \\hfill Month Year -- Month Year

\\begin{itemize}
  \\item Outcome-first bullet: [measurable result] by [specific action] across [scope/scale].
  \\item Technical-depth bullet: [system/problem] solved via [specific approach], achieving [result].
  \\item Leadership bullet: led/mentored/drove [scope] resulting in [outcome].
  \\item Add 3--6 bullets per role. Every bullet must trace to the source resume or user answers.
\\end{itemize}

% ════ SKILLS ════
\\section{Skills}
\\textbf{Languages:} Python, Go, TypeScript, Java \\\\
\\textbf{Frameworks \\& Tools:} React, Kafka, Spark, Kubernetes, Terraform \\\\
\\textbf{Infrastructure:} AWS, GCP, PostgreSQL, Redis, Elasticsearch \\\\
\\textbf{Domains:} Distributed Systems, Data Infrastructure, Platform Engineering

% ════ EDUCATION ════
\\section{Education}
\\noindent\\textbf{University Name} \\hfill City, State \\\\
\\textit{B.S. Computer Science} \\hfill Year

\\end{document}
`.trim();

// ── PDF compilation ───────────────────────────────────────
function compilePdf(latex) {
  const id      = randomId("tex");
  const tmpDir  = os.tmpdir();
  const texPath = path.join(tmpDir, `${id}.tex`);
  const pdfPath = path.join(tmpDir, `${id}.pdf`);
  const logPath = path.join(tmpDir, `${id}.log`);

  fs.writeFileSync(texPath, latex, "utf8");

  const cmd = `pdflatex -interaction=nonstopmode -output-directory="${tmpDir}" "${texPath}"`;
  try {
    // Two passes for stable output
    execSync(cmd, { timeout: 30000, stdio: "pipe" });
    execSync(cmd, { timeout: 30000, stdio: "pipe" });
  } catch (err) {
    // pdflatex exits non-zero on warnings — check if PDF was produced anyway
    if (!fs.existsSync(pdfPath)) {
      const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8").slice(-2000) : "";
      throw new Error(`pdflatex failed: ${log || err.message}`);
    }
  }

  if (!fs.existsSync(pdfPath)) throw new Error("PDF not generated by pdflatex.");

  // Extract page count from log
  let pages = 1;
  if (fs.existsSync(logPath)) {
    const log = fs.readFileSync(logPath, "utf8");
    const m = log.match(/Output written on .+\((\d+) page/);
    if (m) pages = parseInt(m[1], 10);
  }

  const pdfBytes = fs.readFileSync(pdfPath);

  // Cleanup all pdflatex artifacts
  [texPath, pdfPath, logPath,
   path.join(tmpDir, `${id}.aux`),
   path.join(tmpDir, `${id}.out`),
  ].forEach((f) => { try { fs.unlinkSync(f); } catch (_) {} });

  return { pdfBytes, pages };
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
      const systemPrompt = `You are an expert resume analyst. Apply three review lenses to the candidate's resume:

HIRING-MANAGER LENS: Does the resume signal the right level? Is ownership language specific (led, owned, drove) or generic (contributed, helped)? Are impact claims measurable and defensible? Is there evidence of technical depth for the target level?

RECRUITER LENS: Can role fit be determined in a 10-second scan? Are job titles and company names prominent? Does the summary match the target role? Are dates and tenure patterns clean?

ATS LENS: Are section headings standard (Experience, Education, Skills)? Do keywords from the JD appear naturally? Are there formatting risks (tables, columns, graphics)? Is contact info parseable?

Return ONLY valid JSON with this exact schema:
{
  "fit_score": <integer 0-100 — do not inflate, a 60 with honest gaps beats an 85 with vague praise>,
  "fit_rationale": <one sentence explaining the score>,
  "strengths": [<3-5 specific strengths, not generic>],
  "gaps": [<ordered by severity — keep actionable, not generic>],
  "ats_flags": [<formatting or keyword issues>],
  "structured_questions": [
    { "id": "q1", "text": <question targeting a specific gap, answerable in 1-3 sentences>, "hint": <what to include> }
  ]
}

Generate 3-5 structured questions. Each must target one specific gap. Focus on: metrics, scope, ownership, team size, timeline, outcome. Do not ask about information already present in the resume.`;

      const userMessage = `Resume:\n${resume_text}\n\nTarget role: ${target_role} (${target_level})\nVariant family: ${variant_family || "general"}${job_description ? `\n\nJob description:\n${job_description}` : ""}`;
      const raw = await callClaude(systemPrompt, userMessage, 2048);
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
      const answersText = Object.entries(answers || {})
        .filter(([, v]) => v && String(v).trim())
        .map(([k, v]) => `Answer to Q${k}: ${v}`)
        .join("\n");

      const systemPrompt = `You are an expert resume writer producing a role-targeted LaTeX resume variant.

WRITING RULES:
- Outcome-first bullets: start with the measurable result, then the action, then scope.
- Concrete verbs only: led, built, reduced, shipped, owned, designed, drove, migrated.
- Forbidden verbs: contributed, helped, assisted, worked on, involved in.
- Every metric (latency, scale, cost, team size) must come from the source resume or the user's answers. Never fabricate.
- If a gap cannot be filled from user answers, flag it with a [TBD: ...] placeholder — do not approximate.
- Summary: 2-3 sentences, role-targeted. Sentence 1: who they are. Sentence 2: technical edge. No first-person pronouns. No buzzwords.
- Keep bullets to one line where possible; two lines maximum.
- Write 4-6 bullets per role to ensure the page is full.

PAGE FILL REQUIREMENT:
- The output must fill at least 85% of one letter-sized page.
- Do not add fake content — instead expand real bullets with available detail from the source resume and answers.
- Adjust spacing with \\vspace{-2pt} between sections only if the content naturally overflows slightly.

ATS RULES:
- Section headings must be: Summary, Experience, Skills, Education (standard labels).
- No tables, no multi-column layouts, no text boxes, no graphics.
- Contact info must be plain text in the document header.

OUTPUT: Return ONLY the complete, compilable LaTeX source code. No markdown fences, no commentary, no explanation. Start with \\documentclass and end with \\end{document}.

Use this exact template structure:
${LATEX_TEMPLATE}`;

      const userMessage = `SOURCE RESUME:\n${resume_text}\n\nTARGET: ${target_role} (${target_level})\nVARIANT FAMILY: ${variant_family || "general"}${job_description ? `\n\nJOB DESCRIPTION:\n${job_description}` : ""}\n\nUSER ANSWERS TO GAP QUESTIONS:\n${answersText || "(none provided)"}\n\nANALYSIS GAPS TO ADDRESS:\n${(analysis?.gaps || []).join("\n")}`;

      const raw = await callClaude(systemPrompt, userMessage, 4096);
      // Strip markdown fences if Claude wrapped anyway
      const latex = raw
        ? raw.replace(/^```(?:latex|tex)?\n?/i, "").replace(/\n?```$/, "").trim()
        : null;
      variant = { latex: latex || "% Connect ANTHROPIC_API_KEY to generate LaTeX output.\n", simulated: !latex };
    } catch (err) {
      variant = { latex: `% Variant generation failed: ${err.message}\n`, simulated: true };
    }

    return json(res, 200, { ok: true, variant });
  }

  // Compile LaTeX → PDF
  if (req.method === "POST" && url.pathname === "/api/resume/compile-pdf") {
    const body = await parseBody(req);
    const latex = String(body.latex || "").trim();
    if (!latex) return json(res, 400, { error: "No LaTeX content provided." });
    if (!latex.includes("\\documentclass")) return json(res, 400, { error: "Content does not look like valid LaTeX." });

    try {
      const { pdfBytes, pages } = compilePdf(latex);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="resume-variant.pdf"',
        "Content-Length": pdfBytes.length,
        "X-Page-Count": String(pages),
      });
      res.end(pdfBytes);
    } catch (err) {
      return json(res, 500, { error: `PDF compilation failed: ${err.message.slice(0, 400)}` });
    }
    return;
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
