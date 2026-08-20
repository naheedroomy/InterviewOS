# electron/rag/providers/

## Responsibility

This folder implements the pluggable **embedding providers** for the RAG pipeline. Each provider turns text (document chunks, meeting summaries, or search queries) into fixed-length numeric vectors that the vector store uses for similarity search.

The folder owns:
- The shared contract (`IEmbeddingProvider`) that every provider implements.
- Four concrete providers: OpenAI (cloud), Gemini (cloud), Ollama (local server), and Local (bundled on-device model).
- Provider-specific concerns: API endpoints, auth keys, model names, output dimensions, symmetric vs. asymmetric embedding behavior, and local model loading.

It does **not** decide which provider to use — selection/fallback lives in the sibling `EmbeddingProviderResolver.ts`.

## Design

**Strategy pattern via a single interface.** `IEmbeddingProvider` is the contract:

```ts
interface IEmbeddingProvider {
  readonly name: string;        // 'openai' | 'gemini' | 'ollama' | 'local'
  readonly dimensions: number;  // vector length (1536 / 768 / 768 / 384)
  isAvailable(): Promise<boolean>;
  embed(text: string): Promise<number[]>;        // document chunk (for storage)
  embedQuery(text: string): Promise<number[]>;   // search query
  embedBatch(texts: string[]): Promise<number[][]>;
}
```

Key design decisions:

- **`embed` vs `embedQuery` split** — accommodates asymmetric models. Ollama's `nomic-embed-text` prepends `search_document:` / `search_query:` prefixes; the other three models are symmetric and just delegate `embedQuery` → `embed`.
- **`dimensions` is a public constant** so callers (e.g. `VectorStore.backfillEmbeddingProviderMetadata`) can record the vector width per provider without probing.
- **`isAvailable()` is a live probe**, not a static flag. Cloud providers do a real test embed; Ollama checks `/api/tags` for the pulled model; Local tries to load the bundled model.
- **Local is the unconditional fallback.** `LocalEmbeddingProvider` is always available after install (bundled model), so the pipeline can never be left without embeddings.
- **Local model loading** uses `@huggingface/transformers` via a `new Function('return import(...)')` trick to force a true ESM dynamic import (TypeScript's commonjs rewrite would break the ESM-only package). It guards against concurrent init with a shared `loadingPromise` and disables remote downloads (`env.allowRemoteModels = false`, `local_files_only: true`).
- **Model path resolution** differs dev vs. prod: `app.getAppPath()/resources/models` in dev, `process.resourcesPath/models` when packaged (esbuild inlines this file, so `__dirname` is unreliable).
- **Batch behavior varies by provider**: OpenAI has a native batch API; Gemini and Ollama loop sequentially; Local lets transformers.js batch internally and reshapes the flat output.

## Flow

1. `EmbeddingProviderResolver.resolve(config)` builds a candidate list in priority order (OpenAI → Gemini → Ollama → Local), subject to data-scope policy, and returns the first whose `isAvailable()` passes.
2. `EmbeddingPipeline` holds the resolved provider (plus a `LocalEmbeddingProvider` fallback) and calls `embed()` / `embedBatch()` when indexing chunks and summaries, and `embedQuery()` when searching.
3. Each provider performs its own HTTP call (or local inference) and returns `number[]` / `number[][]` vectors.
4. Vectors flow into `VectorStore` for storage and similarity search; the provider `name` + `dimensions` are recorded via `backfillEmbeddingProviderMetadata`.

## Integration

**Consumers (outside this folder):**
- `electron/rag/EmbeddingProviderResolver.ts` — the only place that instantiates providers; imports all four and `IEmbeddingProvider`. Exposes `AppAPIConfig` (openaiKey, geminiKey, ollamaUrl, providerDataScopes) and `resolve()`.
- `electron/rag/EmbeddingPipeline.ts` — consumes the resolved `IEmbeddingProvider` for embedding chunks/summaries/queries; also constructs `LocalEmbeddingProvider` directly as its on-device fallback.
- `electron/rag/VectorStore.ts` — receives vectors and records provider metadata (`backfillEmbeddingProviderMetadata(providerName, dimensions)`).
- `electron/rag/RAGManager.ts` — calls `_backfillEmbeddingProviderMetadata()` to persist provider name/dimensions into the vector store.
- `electron/rag/index.ts` — re-exports `AppAPIConfig` type.

**Dependencies (external):**
- OpenAI: `https://api.openai.com/v1/embeddings` (Bearer key).
- Gemini: `https://generativelanguage.googleapis.com/v1beta/...:embedContent` (key query param, `outputDimensionality=768`).
- Ollama: local `http://localhost:11434` `/api/tags` + `/api/embeddings`.
- Local: bundled `@huggingface/transformers` + `Xenova/all-MiniLM-L6-v2` model under `resources/models`.
