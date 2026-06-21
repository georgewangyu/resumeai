# ResumeAI Vision

ResumeAI should be a role-targeted resume variant engine that produces
truthful, defensible LaTeX and PDF outputs.

## Product Thesis

The product is useful when it turns a source resume, target role, and structured
user answers into a sharper variant without fabricating claims. The canonical
artifact should remain editable LaTeX, with PDF as the derived output.

## Goals

- Preserve a simple upload -> requirements -> questions -> variant flow.
- Keep hiring-manager, recruiter, and ATS critique passes explicit.
- Flag missing evidence instead of inventing metrics or scope.
- Keep user-specific resumes and generated variants out of public repo state.

## Non-Goals

- Do not become a generic resume template marketplace before the core variant
  loop works.
- Do not inflate claims beyond source evidence and user answers.
- Do not hide LaTeX or PDF build failures behind a polished UI.
