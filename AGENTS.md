# ResumeAI — Agent Instructions

## Purpose

ResumeAI is a resume variant engine. The core flow:
upload resume → submit job requirements → answer structured questions → receive role-targeted LaTeX + PDF variant.

## Agent Files

- `agents/AGENT-analyzer.md` — analyze resume through HM, recruiter, and ATS lenses
- `agents/AGENT-variant-builder.md` — generate role-targeted variant from analysis + user answers
- `agents/PROMPT_LIBRARY.md` — reusable prompt modules for all agents
- `agents/VARIANT_STRATEGY.md` — variant family selection logic

## Routing

- For resume analysis tasks: load `agents/AGENT-analyzer.md` first.
- For variant generation tasks: load `agents/AGENT-analyzer.md` + `agents/AGENT-variant-builder.md`.
- For prompt selection: reference `agents/PROMPT_LIBRARY.md`.

## Boundaries

- Public specs and agent logic live in this repo.
- User-specific resumes and generated variants stay in private storage.
- LaTeX build tooling lives in `georgeskills/skills/utility-ops/`.
- Feature backlog lives in `IMPROVEMENTS.md`.

## Behavior

- Do not fabricate metrics, scope, or claims not traceable to the source resume or user answers.
- Keep variants factually consistent with each other.
- Flag gaps rather than approximating when user input is missing.
