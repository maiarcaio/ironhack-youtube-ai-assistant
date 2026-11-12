# RAG evaluation — method, provenance and reproducibility

This folder records **evaluation evidence**, not production claims or private datasets. Source evaluation code is in `backend/scripts/`; current final experiments and detailed traces are hosted in LangSmith and have not yet been exported as versioned files here.

## Current known evidence

The backend owner reported the following on **11 November 2026**:

| Measure | Reported observation | Scope |
|---|---|---|
| Evaluation examples | 36 across three LangSmith datasets | Reported dataset inventory |
| Experiments | Six | LangSmith experiment inventory |
| Final evaluation runs | 27/27 completed | Final V2 question set |
| Correctness | Mean 1.00 | Automated LLM judge over 27 runs |
| Groundedness | Mean 1.00 | Automated LLM judge over 27 runs |
| Retrieval relevance | Mean 1.00 | Automated LLM judge over 27 runs |
| Answer latency p50 | 8.98 seconds | Reported measurement |
| Answer latency p99 | 14.22 seconds | Reported measurement |

These are **team-reported observations**, not independently reproduced from artifacts in this repository. The 1.00 scores are the judge's binary scores for a small, selected question set, **not** proof of universal correctness. The original per-example records, trace links, judge configuration, token/cost totals and exact timing sample have not yet been sanitized and committed. Do not infer costs or confidence intervals.

## Historical baseline and reproducibility limits

The earlier six-question Open University experiment was reported as 6/6 for correctness, groundedness and relevance on 6 November 2026. It is a **historical small-sample baseline**, not automatically comparable to the 27-run V2 evaluation: the datasets, experimental conditions and possibly prompts/evaluator settings differ. Do not claim an improvement percentage without a matched evaluation protocol.

Tracked scripts:
- `backend/scripts/create_evaluation_dataset.py`: imports the **older six-question dataset** from a separate `videomind-test-assets` directory.
- `backend/scripts/run_rag_evaluation.py`: runs the **older six-question experiment** against a configured video record in authenticated Supabase.
- `backend/scripts/rag_evaluators.py`: independent LLM-judge rubric for correctness, groundedness and retrieval relevance.

These scripts **do not reproduce the reported 27-run V2 result** as currently committed. They also require real external credentials and incur model/API charges. Do not run them as part of standard CI or without authorization.

## Required evidence for reproducible V2 evaluation

A future evidence PR should include sanitized, appropriately licensed:
1. Dataset manifest: version, question count, answerable/unanswerable categories, selection process and non-sensitive dataset IDs.
2. Baseline and V2 methodology: same questions and judge setup or an explicit warning that comparisons are not paired.
3. Per-question result table without personal transcripts, tokens, private URLs or credentials.
4. Judging rubric/model version, source-grounding policy, evaluation date and error/abstention categories.
5. Latency distribution (sample size, units, p50/p95/p99, including time to first token where measured), measured token use and costs with currency and accounting window.
6. LangSmith experiment/run identifiers or suitably redacted exports sufficient for an authorized reviewer to audit the summary.

Do not export raw user chats, recording contents, access tokens or confidential project assets into this public repository. Until the underlying evidence arrives, preserve the distinction between **reported results** and **reproducible repository evidence**.
