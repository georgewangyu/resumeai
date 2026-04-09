---
doc_schema: "doc-frontmatter-v1"
doc_id: "resumeai/IMPROVEMENTS"
doc_type: "improvements"
doc_status: "active"
title: "ResumeAI Improvements"
description: "Backlog of future features and product improvements."
memory_eligible: false
memory_priority: "low"
doc_tags:
  - "domain:resume"
  - "visibility:public"
  - "type:improvements"
---
# ResumeAI Improvements

Feature backlog ordered roughly by priority. Implement only when core flow is stable.

## Core Flow Enhancements

- Add support for DOCX upload in addition to PDF.
- Add real-time structured question UI (one question at a time, conversational).
- Add variant diff view — show exactly what changed between original and variant.
- Add multi-variant export (generate all 4 families in one pass, let user pick).

## Analysis Depth

- Add a canonical senior-SWE resume checklist (section-by-section scoring).
- Add ATS-safe section ordering recommendations with examples.
- Add JD gap-analysis template with explicit fit score breakdown.
- Add prompt packs for leadership-focused bullet rewrites (staff+ level).
- Add cover letter draft module seeded from variant output.

## Competitive Feature Reference

Ideas inspired by what Jobscan, Enhancv, Resume.io, and Rezi do — evaluate fit:

- **Jobscan-style match score**: explicit keyword overlap % between resume and JD.
- **Enhancv content suggestions**: pre-written bullet examples by role and industry.
- **Resume.io formatting**: live preview of formatted resume as edits happen.
- **Rezi AI bullet writer**: one-click bullet generation from job title + responsibility.
- **LinkedIn sync**: pull experience from LinkedIn profile as starting point.
- **Interview prep mode**: generate likely interview questions from the resume variant.
- **Salary context**: surface market comp data alongside the role fit analysis.

## Infrastructure

- Add LaTeX template library (multiple clean designs, ATS-safe).
- Add automated PDF compilation via pdflatex in API route.
- Add variant versioning — store and diff multiple rounds of edits.
- Add shareable result link (read-only, time-limited).
