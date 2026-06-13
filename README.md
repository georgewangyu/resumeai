# ResumeAI

Resume variant engine. Upload a resume, get role-targeted LaTeX and PDF variants.

## Flow

```
1. Upload resume (PDF or DOCX)
         ↓
2. Submit job requirements (role, level, JD or job title)
         ↓
3. Answer structured questions about your experience
   (fills gaps the resume does not cover — scope, metrics, ownership)
         ↓
4. Agent generates role-targeted variant
   - hiring-manager critique pass
   - ATS keyword alignment
   - bullet rewrites (impact-first, technical-depth)
         ↓
5. Download LaTeX source + compiled PDF
```

## Principles

- Simple over feature-rich. One flow, one output.
- Defensible claims only. No inflated bullets.
- Variants are role-targeted, not generic.
- LaTeX source is the canonical artifact. PDF is derived.

## Repo Structure

```
resumeai/
├── agents/
│   ├── AGENT-analyzer.md          # core review and critique agent
│   ├── AGENT-variant-builder.md   # variant generation and rewrite agent
│   ├── PROMPT_LIBRARY.md          # reusable prompt modules
│   └── VARIANT_STRATEGY.md        # variant family logic
├── examples/
│   └── senior-swe/                # sample resume (LaTeX + PDF)
├── IMPROVEMENTS.md                # backlog of future features
└── README.md
```

## Validation

```bash
npm test
```

For the browser-based funnel check, start the backend first and then run:

```bash
node backend/server.js
npm run qa:flow
```

## Agent Boundary

- Public agent specs and prompt library live here.
- User-specific resumes and generated variants stay in private storage.
- LaTeX build tooling lives in `georgeskills/skills/utility-ops/`.
