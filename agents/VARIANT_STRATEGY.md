---
doc_schema: "doc-frontmatter-v1"
doc_id: "resumeai/agents/VARIANT_STRATEGY"
doc_type: "resume_doc"
doc_status: "active"
title: "Resume Variant Strategy"
description: "Variant family logic for generating role-targeted resume variants without duplication."
memory_eligible: false
memory_priority: "low"
doc_tags:
  - "domain:resume"
  - "visibility:public"
  - "type:resume_doc"
---
# Resume Variant Strategy

Logic for selecting and generating role-targeted resume variants.

## Why Variants

Different role families emphasize different signals. One generic resume
underserves at least one audience. Variants reorder and reframe existing
evidence — they do not fabricate new claims.

## Variant Families

### `data_infra`
Emphasizes: distributed systems, storage, reliability, performance, scale.
Lead signals: system ownership, throughput/latency improvements, reliability SLAs.
Keyword targets: Kafka, Spark, Flink, Cassandra, S3, data pipelines, SLA, p99.

### `ai_infra`
Emphasizes: AI/ML platform, developer tooling, experimentation systems, training infra.
Lead signals: model serving, training pipelines, experiment frameworks, GPU utilization.
Keyword targets: PyTorch, CUDA, Ray, Triton, feature stores, model registry, A/B infra.

### `product_backend`
Emphasizes: product impact, iteration speed, cross-functional delivery, API design.
Lead signals: shipped features, user impact, cross-team collaboration, velocity.
Keyword targets: REST/gRPC APIs, service ownership, product-eng partnership, growth metrics.

### `general`
Fallback when role family is unclear or explicitly broad.
Balanced ordering: one strong system bullet, one product/impact bullet, one ownership signal.

## Variant Workflow

1. Map target role to variant family (ask user if unclear).
2. Rewrite summary for the family.
3. Reorder top 2 bullets in each role to lead with the family's priority signal.
4. Adjust keywords in skills section for JD alignment.
5. Run ATS and hiring-manager review pass.
6. Preserve factual consistency across all variants.

## Governance Rules

- All variants share the same base facts.
- Metrics must match across variants — never round differently per variant.
- Discard bullets that are not defensible at interview.
- Maximum one variant per role family per application cycle.
