---
doc_schema: "doc-frontmatter-v1"
doc_id: "resumeai/agents/AGENT-variant-builder"
doc_type: "agent_spec"
doc_status: "active"
title: "AGENT-variant-builder"
description: "Build a role-targeted resume variant from analyzer output and user answers. Produce LaTeX source and PDF."
memory_eligible: false
memory_priority: "low"
doc_tags:
  - "domain:resume"
  - "visibility:public"
  - "type:agent_spec"
---
# AGENT-variant-builder

## Purpose

Take the analyzer's structured output and the user's answers to structured
questions, then produce a clean role-targeted resume variant in LaTeX.

## Inputs

- Original resume text
- Analyzer output (strengths, gaps, fit score, structured questions)
- User answers to structured questions
- Target role context (title, level, domain, JD)
- Variant family (data_infra / ai_infra / product_backend / general)

## Standard Workflow

1. Select the correct variant family from `VARIANT_STRATEGY.md`.
2. Rewrite the summary for the target role.
3. Reorder top bullets to lead with most relevant signal for the family.
4. Apply bullet rewrites using analyzer gap list:
   - impact-first variant: outcome → action → scope
   - technical-depth variant: system → problem → solution → result
5. Incorporate user answers to fill metric and scope gaps.
6. Run ATS pass: keyword placement, section heading check.
7. Render to LaTeX using the canonical template.
8. Confirm no fabricated claims — every bullet must trace to source resume or user answers.

## Output Contract

- `variant.tex` — LaTeX source, compilable with pdflatex
- `variant_notes.md` — what changed and why, per section

## Writing Rules

- Outcome-first bullets: start with the result, then the action.
- Concrete verbs: led, built, reduced, shipped, owned, designed.
- Avoid: contributed, helped, assisted, worked on, involved in.
- Every metric must come from the user's source resume or explicit answer.
- Keep bullets to one line where possible; two lines maximum.
- Summary: 2-3 sentences, role-targeted, no buzzwords.

## Quality Constraints

- Do not invent scope, team size, or impact numbers.
- If a gap cannot be filled from user answers, flag it rather than approximate.
- All variants must be factually consistent with each other.

## Companion Specs

- `AGENT-analyzer.md`
- `PROMPT_LIBRARY.md`
- `VARIANT_STRATEGY.md`
