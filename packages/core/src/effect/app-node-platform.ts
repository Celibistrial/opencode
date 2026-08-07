import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { LLMClient, RequestExecutor } from "@opencode-ai/llm/route"
import { FileSystem, Path } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { HttpClient } from "effect/unstable/http"
import { makeGlobalNode } from "./app-node"

export const filesystem = makeGlobalNode({ service: FileSystem.FileSystem, layer: NodeFileSystem.layer, deps: [] })
export const path = makeGlobalNode({ service: Path.Path, layer: NodePath.layer, deps: [] })
export const httpClient = makeGlobalNode({ service: HttpClient.HttpClient, layer: FetchHttpClient.layer, deps: [] })
export const requestExecutor = makeGlobalNode({
  service: RequestExecutor.Service,
  // retries: 0 — the session processor owns retry/backoff (retry status UI,
  // reasoning reset, context-overflow compaction). Native transport-level retry
  // would run underneath it and hide those, so surface errors to the processor.
  layer: RequestExecutor.makeLayer({ retries: 0 }),
  deps: [httpClient],
})
export const llmClient = makeGlobalNode({ service: LLMClient.Service, layer: LLMClient.layer, deps: [requestExecutor] })

export * as LayerNodePlatform from "./app-node-platform"
