import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import { Flag } from "@opencode-ai/core/flag/flag"
import { createSimpleContext } from "./helper"
import { batch, onCleanup, onMount } from "solid-js"

export type EventSource = {
  subscribe: (handler: (event: GlobalEvent) => void) => Promise<() => void>
}

export const { use: useSDK, provider: SDKProvider } = createSimpleContext({
  name: "SDK",
  init: (props: {
    url: string
    directory?: string
    fetch?: typeof fetch
    headers?: RequestInit["headers"]
    events?: EventSource
  }) => {
    const abort = new AbortController()
    let sse: AbortController | undefined

    function createSDK() {
      return createOpencodeClient({
        baseUrl: props.url,
        signal: abort.signal,
        directory: props.directory,
        fetch: props.fetch,
        headers: props.headers,
      })
    }

    let sdk = createSDK()

    const handlers = new Set<(event: GlobalEvent) => void>()
    // per-payload-type handler sets so consumers interested in one event type
    // don't run (and allocate) for every streamed delta — most subscribers
    // filter by type, so wildcard fan-out made each event visit ~20 closures
    const typedHandlers = new Map<string, Set<(event: GlobalEvent) => void>>()
    const emitter = {
      emit(_type: "event", event: GlobalEvent) {
        for (const handler of handlers) handler(event)
        const typed = typedHandlers.get(event.payload.type)
        if (typed) for (const handler of typed) handler(event)
      },
      on(_type: "event", handler: (event: GlobalEvent) => void) {
        handlers.add(handler)
        return () => {
          handlers.delete(handler)
        }
      },
      onPayloadType(type: string, handler: (event: GlobalEvent) => void) {
        let typed = typedHandlers.get(type)
        if (!typed) {
          typed = new Set()
          typedHandlers.set(type, typed)
        }
        typed.add(handler)
        return () => {
          typed.delete(handler)
        }
      },
    }

    let queue: GlobalEvent[] = []
    let timer: Timer | undefined
    let last = 0
    const retryDelay = 1000
    const maxRetryDelay = 30000
    // ADAPTIVE coalescing of streaming events. opentui re-lays-out the ENTIRE growing
    // assistant message on every content update (updateLayout dominates CPU, ~O(N) per
    // flush → O(N*flushes) per stream), which is what pins a core on long responses.
    // We throttle flushes MORE as the active message grows: short replies stay snappy
    // (~48ms), a huge message backs off toward ~400ms, cutting re-layouts up to ~8x on
    // long/code-heavy streams. This does NOT touch scrolling (scroll doesn't flush
    // content) — frame-rate/scroll smoothness is the separate targetFps knob. streamChars
    // resets after an idle gap so each new message starts snappy again.
    // OPENCODE_TUI_FLUSH_MS pins a fixed interval (disables adaptivity) if set.
    const FLUSH_OVERRIDE = Math.max(0, Math.min(1000, Number(process.env["OPENCODE_TUI_FLUSH_MS"]) || 0))
    const FLUSH_MIN = 48
    const FLUSH_MAX = 400
    let streamChars = 0
    const flushInterval = () =>
      FLUSH_OVERRIDE || Math.max(FLUSH_MIN, Math.min(FLUSH_MAX, FLUSH_MIN + Math.floor(streamChars / 60)))

    const flush = () => {
      if (queue.length === 0) return
      const events = queue
      queue = []
      timer = undefined
      last = Date.now()
      // Batch all event emissions so all store updates result in a single render
      batch(() => {
        for (const event of events) {
          emitter.emit("event", event)
        }
      })
    }

    const handleEvent = (event: GlobalEvent) => {
      const now = Date.now()
      // Reset the adaptive backoff once streaming pauses (new message starts fresh/snappy).
      if (now - last > 1500) streamChars = 0
      const delta = (event as any).payload?.properties?.delta
      if (typeof delta === "string") streamChars += delta.length

      queue.push(event)
      const elapsed = now - last

      if (timer) return
      // If we just flushed recently, batch this with future events into the next
      // frame; otherwise flush immediately to avoid first-token latency.
      const interval = flushInterval()
      if (elapsed < interval) {
        timer = setTimeout(flush, interval)
        return
      }
      flush()
    }

    function startSSE() {
      sse?.abort()
      const ctrl = new AbortController()
      sse = ctrl
      ;(async () => {
        let attempt = 0
        while (true) {
          if (abort.signal.aborted || ctrl.signal.aborted) break

          const events = await sdk.global.event({
            signal: ctrl.signal,
            sseMaxRetryAttempts: 0,
          })

          if (Flag.OPENCODE_EXPERIMENTAL_WORKSPACES) {
            // Start syncing workspaces, it's important to do this after
            // we've started listening to events
            await sdk.sync.start().catch(() => {})
          }

          for await (const event of events.stream) {
            if (ctrl.signal.aborted) break
            handleEvent(event)
          }

          if (timer) clearTimeout(timer)
          if (queue.length > 0) flush()
          attempt += 1
          if (abort.signal.aborted || ctrl.signal.aborted) break

          // Exponential backoff
          const backoff = Math.min(retryDelay * 2 ** (attempt - 1), maxRetryDelay)
          await new Promise((resolve) => setTimeout(resolve, backoff))
        }
      })().catch(() => {})
    }

    onMount(async () => {
      if (props.events) {
        const unsub = await props.events.subscribe(handleEvent)
        onCleanup(unsub)

        if (Flag.OPENCODE_EXPERIMENTAL_WORKSPACES) {
          // Start syncing workspaces, it's important to do this after
          // we've started listening to events
          await sdk.sync.start().catch(() => {})
        }
      } else {
        startSSE()
      }
    })

    onCleanup(() => {
      abort.abort()
      sse?.abort()
      if (timer) clearTimeout(timer)
      handlers.clear()
    })

    return {
      get client() {
        return sdk
      },
      directory: props.directory,
      event: emitter,
      fetch: props.fetch ?? fetch,
      url: props.url,
    }
  },
})
