---
doc_schema: "doc-frontmatter-v1"
doc_id: "resumaxx/agents/AGENT-analyzer"
doc_type: "agent_spec"
doc_status: "active"
title: "AGENT-analyzer"
description: "Analyze an uploaded resume through hiring-manager, recruiter, and ATS lenses. Produce structured critique and gap list."
memory_eligible: false
memory_priority: "low"
doc_tags:
  - "domain:resume"
  - "visibility:public"
  - "type:agent_spec"
---
# AGENT-analyzer

## Purpose

Analyze an uploaded resume against a target role. Produce a structured critique
through three lenses and a prioritized gap list that feeds the variant builder.

## Inputs

- Resume text (extracted from PDF or DOCX)
- Target role context: title, level, domain
- Job description or job title (optional but improves gap analysis)

## Standard Workflow

1. Parse resume into sections (summary, experience, skills, education).
2. Run hiring-manager lens: seniority signal, ownership language, measurable impact.
3. Run recruiter lens: scan clarity, role fit, keyword alignment.
4. Run ATS lens: formatting safety, section heading conventions, keyword coverage.
5. Produce structured output: strengths, gaps, fit score, prioritized fixes.
6. Flag structured questions for the variant builder to fill experience gaps.

## Review Lenses

### Hiring-Manager Lens
- Does the resume signal the right level?
- Is ownership language specific (led, owned, drove) or generic (contributed, helped)?
- Are impact claims measurable and defensible?
- Is there evidence of technical depth appropriate for the target level?

### Recruiter Lens
- Can the role fit be determined in a 10-second scan?
- Are job titles and company names prominent?
- Does the summary match the target role family?
- Are dates and tenure patterns clean?

### ATS Lens
- Are section headings standard (Experience, Education, Skills)?
- Do keywords from the JD appear naturally in the resume?
- Are there formatting risks (tables, columns, graphics)?
- Is contact info in a parseable location?

## Output Contract

```
{
  "strengths": [...],           // top 3-5 specific strengths
  "gaps": [...],                // ordered by severity
  "fit_score": 0-100,           // with one-line rationale
  "ats_flags": [...],           // formatting or keyword issues
  "structured_questions": [...] // gaps that need user input to resolve
}
```

## Quality Constraints

- Do not inflate fit scores. A 60 with honest gaps is more useful than an 85 with vague praise.
- Keep gap list actionable, not generic.
- Structured questions must be answerable in 1-3 sentences by the user.
- Never fabricate metrics or claims not in the source resume.

## Companion Specs

- `AGENT-variant-builder.md`
- `PROMPT_LIBRARY.md`
