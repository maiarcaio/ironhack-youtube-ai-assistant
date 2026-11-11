# VideoMind AI — Frontend Presentation Runbook

Target duration: 15–20 minutes.
Use only records and answers that have already been verified. Do not present a preprocessed record as a new ingestion.

## Slide and demonstration structure

1. **Problem and user value — 2 minutes**
   - Long-form video is difficult to search and verify.
   - VideoMind keeps the player, transcript, grounded answer, evidence, and notes in one study context.

2. **Product journey — 2 minutes**
   - Sign in, open the owner-scoped library, select a ready YouTube record, and show the shared workspace.
   - Explain that the selected record is identified by the backend UUID, not a YouTube identifier.

3. **Transcript and player — 2 minutes**
   - Open Transcript, search a phrase that visibly exists, and click a genuine timestamp.
   - Point out that the player remains present while the right-side tool changes.
   - State the cross-origin iframe limitation honestly: the interface dispatches the seek, but the browser test cannot read the iframe clock.

4. **Grounded Q&A — 3 minutes**
   - Ask one factual Terra question from the visible transcript.
   - Show streamed text, the completed answer, source excerpts, and a citation timestamp.
   - If the backend is slow, use the captured acceptance evidence rather than inventing an answer.
   - Use Sol only when a real, grounded response has been verified; otherwise label it as not demonstrated.

5. **Notes and continuity — 1 minute**
   - Save a note at the current playback timestamp.
   - Show browser-local ownership and return to the note from Saved Notes.
   - Explain that notes are not synchronized through the backend and are isolated by authenticated user.

6. **Multimodal processing — 2 minutes**
   - Explain the verified YouTube path and the intended authorized-audio path: upload, Whisper, timestamped transcript, embeddings, and signed playback.
   - Audio acceptance is currently blocked by Render storage HTTP 503 and preview-origin CORS; show neither as a successful live workflow.

7. **Architecture and agentic RAG — 3 minutes**
   - React/Supabase session → authenticated FastAPI → Supabase records/transcripts → embeddings/Pinecone → LangChain agent → JSON/SSE answer with citations.
   - Explain why ownership, backend UUIDs, status polling, and source citations are enforced in the frontend.
   - Describe LangChain/LangGraph tools for transcript search, exact phrase lookup, transcript overview, metadata, and grounded response generation as implemented in the backend documentation.
   - Show only measured evaluation results supplied by the backend owner.

8. **Evaluation, deployment, and limitations — 2 minutes**
   - Compare a baseline without searchable evidence against source-backed answers.
   - Address correctness, hallucination handling, retrieval relevance, latency, cost, memory, and future-proofing.
   - Mark unavailable metrics as pending backend evidence rather than estimating them.

9. **Conclusion and next steps — 1 minute**
   - Summarize the verified YouTube study workflow and the remaining audio integration blockers.

## Evidence checklist

- Baseline: record the original non-grounded or non-searchable workflow used for comparison; the baseline result is still required from the team.
- Correctness and hallucinations: use a labeled question set with source-supported answers and insufficient-evidence cases.
- Retrieval relevance: capture retrieved chunk IDs/excerpts and a defined relevance judgment.
- Latency: measure upload-to-ready, transcript retrieval, first token, and completed answer separately.
- Cost: identify model, embedding, storage, and hosting assumptions; do not estimate without source data.
- Memory: describe browser-local notes and backend thread persistence separately.
- Future-proofing: mention provider abstraction, UUID ownership, SSE event contracts, and the separation between presentation and services.

## Evidence placeholders for backend-owned sections

- LangSmith: provide the evaluation run URL, dataset size, evaluator definitions, and recorded correctness/groundedness/retrieval results.
- Latency: provide upload-to-ready, transcript retrieval, first-token, and completion measurements from a reproducible run.
- Cost: provide model, embedding, storage, and hosting assumptions with the measurement window.
- Memory: provide the distinction between browser-local notes and backend-persisted threads, plus any measured resource usage.
- Agent/model inventory: confirm the production model names, tools, and fallback behavior before presenting them as deployed facts.

## Honest fallback

If live ingestion or chat is unavailable, demonstrate an already indexed record and label all intercepted browser tests as simulated. Show the failure state and explain the recovery path. Do not claim that Whisper, Supabase Storage, Pinecone indexing, or audio-grounded answers were proven unless the full live path completed.
