# Build context

## review (16 Sep 2026, review-and-iterate)
- security_score: A-
- quality_score: A-
- ready_for_mainnet: false
- findings: 6 (2 P1, 2 P2, 2 P3) — all fixed or documented, see docs/REVIEW.md
- blockers for mainnet: single-key upgrade authority whose secret was exposed;
  no fuzzing yet; per-market oracle parameters still use one default
