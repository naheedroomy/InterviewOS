# electron/rag/

Retrieval-Augmented Generation (RAG) subsystem for meeting Q&A. Turns meeting transcripts into searchable, embeddable chunks and answers user questions against them with an LLM.

## Responsibility

- **Indexing**: Convert raw meeting transcripts into cleaned, semantically chunked units, persist them to SQLite, and generate vector embeddings for similarity search.
- **Retrieval**: Given a user query, embed it, find the most relevant chunks (meeting-scoped or global), re-rank by relevance + recency, and assemble a token-budgeted context.
- **Generation**: Build a RAG prompt from the retrieved context and stream an LLM answer.
- **Live (JIT) indexing**: Incrementally index a meeting's transcript while it is still in progress so questions can be answered before the meeting ends.
- **Provider abstraction**: Support multiple embedding backends (Gemini, OpenAI, Ollama, on-device local) with automatic fallback and dimension-safety handling.

## Design

### Module map

| File | Role |
|------|------|
| `index.ts` | Barrel export of the public RAG API. |
| `RAGManager.ts` | Central orchestrator. Owns the pipeline, exposes the high-level lifecycle (`processMeeting`, `query`, live indexing, reprocessing, re-indexing). |
| `TranscriptPreprocessor.ts` | Cleans raw segments (fillers, acknowledgements, repeated words), merges consecutive same-speaker turns, normalizes speaker labels, and annotates semantic markers (question/decision/action item). Also `estimateTokens` (≈1 token / 4 chars). |
| `SemanticChunker.ts` | Turn-based chunking with sliding-window overlap. Targets 200–400 tokens/chunk, splits on speaker change or token limit, carries ~50 tokens of overlap across boundaries. `formatChunkForContext` renders `[mm:ss] Speaker: text`. |
| `EmbeddingPipeline.ts` | Post-meeting, queue-based embedding generation with retry/backoff, crash recovery, per-meeting local-fallback downgrade, and hard 30s timeouts on every embed call. |
| `EmbeddingProviderResolver.ts` | Picks the best available provider in priority order (OpenAI → Gemini → Ollama → Local), honoring data-scope policy. |
| `RAGRetriever.ts` | Retrieval orchestration: embed query, over-fetch candidates, re-rank by relevance + recency, select within token budget, format context. Also regex-based `detectIntent` and `detectScope`. |
| `VectorStore.ts` | SQLite-backed storage. Dual-writes embeddings (BLOB column + per-dimension `vec0` virtual tables). Native `sqlite-vec` search with a pure-JS cosine fallback, both offloaded to a worker thread. |
| `vectorSearchWorker.ts` | `worker_threads` worker that runs all vector search (native vec0 ANN and JS cosine) off the Electron main thread. |
| `LiveRAGIndexer.ts` | JIT indexing: a 30s background timer chunks and embeds only *new* transcript segments during a live meeting. |
| `OllamaBootstrap.ts` | Ensures the Ollama daemon is running and the embedding model (`nomic-embed-text`) is pulled, with streaming progress and resume-from-DB-state. |
| `prompts.ts` | RAG system prompts (meeting vs global), intent hints, fallback strings, and `buildRAGPrompt`. |
| `providers/` | `IEmbeddingProvider` interface + concrete providers (Gemini, OpenAI, Ollama, Local). |

### Key abstractions & decisions

- **Pluggable embedding providers** via `IEmbeddingProvider` (`name`, `dimensions`, `isAvailable`, `embed`, `embedQuery`, `embedBatch`). Providers differ in dimensions (Gemini 768, OpenAI 1536, Ollama 768, Local 384), so dimension-safety is a first-class concern.
- **Asymmetric models**: Ollama's `nomic-embed-text` prefixes documents with `search_document:` and queries with `search_query:`; `embedQuery` exists specifically for this. Gemini/OpenAI/Local are symmetric.
- **Dual-write vector storage**: each embedding is stored both as a Float32 BLOB on the row and in a per-dimension `vec_chunks_{dim}` / `vec_summaries_{dim}` `vec0` virtual table (provisioned lazily via `DatabaseManager.ensureVecTableForDim`). Native search uses the vec0 tables; the JS fallback reads BLOBs and filters by byte length (`dim * 4`) to drop mismatched-dimension rows.
- **Worker-thread offload**: all vector search runs in `vectorSearchWorker.ts` to avoid blocking the Electron main thread. Requests carry a 30s deadman timeout; native search opens its own read-only DB connection in the worker (cached by path).
- **Queue-based, crash-safe embedding**: `embedding_queue` table persists work. `processQueue` recovers items stuck in `processing` after a crash, retries with exponential backoff (max 3), and on primary-provider exhaustion downgrades the whole meeting to the local on-device provider (sentinel `retry_count = -1`), clearing embeddings first to avoid dimension clashes.
- **Provider metadata & re-indexing**: meetings record `embedding_provider`/`embedding_dimensions`. On provider switch, incompatible meetings are detected and re-embedded (`reindexIncompatibleMeetings`). A startup backfill repairs meetings with NULL metadata.
- **Intent & scope detection are regex-based** (fast, deterministic, no LLM cost): `detectIntent` (decision_recall / speaker_lookup / action_items / summary / open_question) and `detectScope` (meeting vs global).
- **Relevance + recency re-ranking**: `finalScore = (1-w)*similarity + w*recencyScore`, where recency decays exponentially with a 7-day half-life (`exp(-ageHours/168)`), default `w = 0.3`.
- **Token budget**: retrieval over-fetches `topK*2` candidates, re-ranks, then selects within `maxTokens` (default 1500) and `topK` (default 8), finally sorting selected chunks by timestamp for coherent reading.

## Flow

### Post-meeting indexing (write path)

```
meeting ends
  └─ RAGManager.processMeeting(meetingId, transcript, summary?)
       1. preprocessTranscript()   → cleaned, annotated segments
       2. chunkTranscript()        → Chunk[] (200–400 tokens, overlap)
       3. vectorStore.saveChunks() → rows in `chunks` (no embeddings yet)
       4. vectorStore.saveSummary() (if summary) → `chunk_summaries`
       5. embeddingPipeline.queueMeeting() → INSERT OR IGNORE into `embedding_queue`
       6. processQueue() (background) → for each item:
             embedChunk / embedMeetingSummary via active provider
             vectorStore.storeEmbedding / storeSummaryEmbedding (dual-write)
             mark completed; on failure retry w/ backoff, then local fallback
```

### Query path (read path)

```
RAGManager.query(query, currentMeetingId?)
  └─ retriever.detectScope() → 'meeting' | 'global'
       ├─ queryMeeting(): if no embeddings, use JIT live chunks or throw
       │     NO_MEETING_EMBEDDINGS / NO_RELEVANT_CONTEXT_FOUND
       └─ queryGlobal(): search chunks + summaries across all meetings
  └─ retriever.retrieve()/retrieveGlobal()
       1. embed query (getEmbeddingForQuery)
       2. vectorStore.searchSimilar() / searchSummaries() (worker)
       3. re-rank by relevance + recency
       4. select within token budget; sort by timestamp
       5. formatChunkForContext()
  └─ buildRAGPrompt(query, context, scope, intent)
  └─ llmHelper.streamChatWithGemini() → streamed answer
```

### Live (JIT) indexing

```
meeting session starts
  └─ RAGManager.startLiveIndexing(meetingId)
       └─ LiveRAGIndexer.start() → 30s setInterval
during meeting
  └─ RAGManager.feedLiveTranscript(segments) → append-only buffer
  └─ tick() every 30s: slice new segments (≥3), preprocess, chunk,
       saveChunks, embed each (fire-and-forget), advance high-water mark
query during meeting
  └─ queryMeeting() sees live chunks already in VectorStore → JIT RAG
meeting ends
  └─ RAGManager.stopLiveIndexing() → final flush
  └─ processMeeting() later replaces JIT chunks with the complete version
```

### Provider selection

```
EmbeddingProviderResolver.resolve(config)
  OpenAI (if key + scope allows) → Gemini (if key + scope allows)
  → Ollama (default localhost:11434) → Local (always last, always works)
  first isAvailable() wins; scope-denied cloud providers route to Ollama/Local
```

## Integration

- **`../LLMHelper`**: `RAGManager` holds an `LLMHelper` (set via `setLLMHelper`) and streams answers through `streamChatWithGemini`. `isReady()` requires both the embedding pipeline and the LLM helper.
- **`../db/DatabaseManager`**: shared `better-sqlite3` DB instance; `VectorStore` uses it for writes and `DatabaseManager.ensureVecTableForDim` / `KNOWN_DIMS` for vec0 table provisioning. `reprocessMeeting`/`ensureDemoMeetingProcessed` fetch meeting details via `DatabaseManager.getInstance().getMeetingDetails`.
- **`../llm/ProviderRouter`**: `ProviderDataScopePolicy` and `assertProviderDataScopes` gate cloud embedding providers (`openai_embeddings`, `gemini_embeddings`) so data-scope settings can deny cloud routing.
- **Electron main process**: `VectorStore` spawns `vectorSearchWorker.js` (compiled to `dist-electron`) as a worker thread. `EmbeddingPipeline` notifies renderer windows via IPC events `embedding:incompatible-provider-warning` and `embedding:fallback-activated`.
- **Renderer**: queue status surfaced via `getQueueStatus()`; embedding progress/fallback toasts via the IPC events above.
- **SQLite schema (tables touched)**: `chunks`, `chunk_summaries`, `embedding_queue`, `meetings` (embedding_provider/dimensions, is_processed), `app_state` (last_embedding_provider, ollama_pull_status), plus per-dimension `vec_chunks_{dim}` / `vec_summaries_{dim}` virtual tables.
- **`OllamaBootstrap`**: used to ensure the Ollama daemon + `nomic-embed-text` model are available so the Ollama provider can be selected.
