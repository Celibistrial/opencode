import type { GlobalEvent } from "@/bus/global"

const DELTA_TYPE = "message.part.delta"

// A part.delta event carries an incremental string for one (messageID, partID, field).
// Consecutive deltas for the same target can be merged loss-free by concatenating their
// `delta` strings — the consumer appends `existing + delta`, so one merged delta produces
// the identical result as the individual ones.
function deltaKey(event: GlobalEvent): string | undefined {
  const payload = event.payload
  if (!payload || payload.type !== DELTA_TYPE) return undefined
  const props = payload.properties
  if (!props || typeof props.delta !== "string" || typeof props.field !== "string") return undefined
  return `${props.messageID}:${props.partID}:${props.field}`
}

/**
 * Coalesces per-token `message.part.delta` events before they cross the worker→TUI
 * boundary, so a fast model streaming N tokens produces ~(duration/windowMs) postMessages
 * instead of N. It NEVER reorders: any event that isn't a same-target delta flushes the
 * buffered delta first, so interleaving (e.g. reasoning vs text, or a part-end) is preserved.
 * Purely reduces event count/serialization — the merged text is identical.
 */
export function createDeltaCoalescer(input: {
  emit: (event: GlobalEvent) => void
  windowMs: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}) {
  const setTimer = input.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = input.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  let pending: GlobalEvent | undefined
  let pendingKey: string | undefined
  let timer: unknown

  function flush() {
    if (timer !== undefined) {
      clearTimer(timer)
      timer = undefined
    }
    if (pending) {
      const out = pending
      pending = undefined
      pendingKey = undefined
      input.emit(out)
    }
  }

  function handle(event: GlobalEvent) {
    const key = deltaKey(event)
    if (key === undefined) {
      // Non-delta event: flush any buffered delta first so ordering is preserved.
      flush()
      input.emit(event)
      return
    }
    if (pending && pendingKey === key) {
      pending.payload.properties.delta += event.payload.properties.delta
      return
    }
    // A delta for a different target: flush the previous stream, then buffer a private
    // copy of this one (cloned so merging never mutates the shared bus event object).
    flush()
    pending = { ...event, payload: { ...event.payload, properties: { ...event.payload.properties } } }
    pendingKey = key
    // Bound latency to windowMs from the first buffered delta (not reset on merge).
    timer = setTimer(flush, input.windowMs)
  }

  return { handle, flush }
}
