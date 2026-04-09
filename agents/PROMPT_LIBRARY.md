---
doc_schema: "doc-frontmatter-v1"
doc_id: "resumeai/agents/PROMPT_LIBRARY"
doc_type: "resume_doc"
doc_status: "active"
title: "Resume Prompt Library"
description: "Reusable prompt modules for resume analysis, tailoring, and rewriting."
memory_eligible: false
memory_priority: "low"
doc_tags:
  - "domain:resume"
  - "visibility:public"
  - "type:resume_doc"
---
# Resume Prompt Library

Reusable prompt modules for the analyzer and variant builder agents.

---

## 1) Hiring-Manager Critique

```text
Act as a senior hiring manager for [ROLE] roles at a [LEVEL] bar.
Critique this resume for: level alignment, technical depth, ownership signal,
and measurable impact.

Return:
1. Top 3 strengths (specific, not generic)
2. Top 3 gaps (ordered by severity)
3. Missing evidence for the target level
4. Prioritized fixes (max 5, actionable)
```

---

## 2) Job-Description Fit Analysis

```text
Analyze the candidate's fit for this job description.

Steps:
1. Identify must-have requirements vs nice-to-have.
2. Map explicit matches from resume evidence.
3. List critical gaps with severity (blocking / addressable / minor).
4. Provide fit score (0-100) with one-line rationale.
5. Recommend: apply now / strengthen first / wrong target.
```

---

## 3) ATS Compatibility Pass

```text
Evaluate this resume for ATS compatibility against this job description.

Check:
- Section headings (standard vs non-standard)
- Keyword coverage and natural placement
- Formatting risks (tables, columns, headers/footers, graphics)
- Contact info parseability

Return: concise remediation steps with rewritten snippets where needed.
```

---

## 4) Structured Gap Questions

```text
Based on the gap list from the hiring-manager critique, generate 3-5 structured
questions for the candidate to answer.

Rules:
- Each question targets one specific gap.
- Questions must be answerable in 1-3 sentences.
- Focus on: metrics, scope, ownership, team size, timeline, outcome.
- Do not ask for information already present in the resume.

Format: numbered list, one question per gap.
```

---

## 5) Bullet Rewrite — Impact-First

```text
Rewrite this resume bullet in impact-first format.

Format: [Outcome] by [Action] across [Scope/Context]

Rules:
- Lead with the measurable result.
- Use a strong concrete verb for the action.
- Include scope (team size, system scale, time frame) where available.
- Keep to one line. Two lines maximum.
- Do not add metrics not in the original bullet or user-provided context.
```

---

## 6) Bullet Rewrite — Technical Depth

```text
Rewrite this resume bullet to emphasize technical depth for a senior engineering audience.

Format: [System/Problem] → [Technical Approach] → [Result]

Rules:
- Name the specific system, stack, or problem class.
- Show the technical decision or design, not just the output.
- End with a concrete result (latency, throughput, reliability, cost, scale).
- Avoid generic terms: scalable, robust, efficient, modern.
```

---

## 7) Summary Rewrite

```text
Rewrite this professional summary for a [ROLE] at [LEVEL] targeting [DOMAIN].

Rules:
- 2-3 sentences maximum.
- Sentence 1: who you are and what you build.
- Sentence 2: your specific technical or domain edge.
- Sentence 3 (optional): what you are optimizing for in your next role.
- No buzzwords: passionate, results-driven, innovative, dynamic.
- No first-person pronouns.
```

---

## 8) Final QA Pass

```text
Review this completed resume variant for consistency and quality.

Check:
1. All bullets trace to original resume or user-provided answers (no fabricated claims).
2. Metrics are consistent across all mentions of the same project.
3. Tense is consistent (past tense for past roles, present for current).
4. No generic verb usage: contributed, helped, assisted, worked on.
5. Summary matches the variant family and target role.
6. ATS section headings are standard.

Return: pass / flag list with line references.
```
