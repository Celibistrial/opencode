import { describe, test, expect } from "bun:test"
import { createDeltaCoalescer } from "@/cli/tui/delta-coalescer"
import type { GlobalEvent } from "@/bus/global"

function delta(partID: string, d: string, field = "text"): GlobalEvent {
  return {
    payload: {
      id: "evt",
      type: "message.part.delta",
      properties: { sessionID: "s", messageID: "m", partID, field, delta: d },
    },
  }
}
function other(type = "message.part.updated"): GlobalEvent {
  return { payload: { id: "evt", type, properties: { sessionID: "s", messageID: "m", partID: "p1" } } }
}

function harness() {
  const emitted: GlobalEvent[] = []
  let pendingTimer: (() => void) | undefined
  const c = createDeltaCoalescer({
    emit: (e) => emitted.push(e),
    windowMs: 20,
    setTimer: (fn) => {
      pendingTimer = fn
      return 1
    },
    clearTimer: () => {
      pendingTimer = undefined
    },
  })
  return { c, emitted, fireTimer: () => pendingTimer?.() }
}

describe("delta coalescer", () => {
  test("merges consecutive same-part deltas into one emit", () => {
    const { c, emitted, fireTimer } = harness()
    c.handle(delta("p1", "a"))
    c.handle(delta("p1", "b"))
    c.handle(delta("p1", "c"))
    expect(emitted).toHaveLength(0) // buffered until flush
    fireTimer()
    expect(emitted).toHaveLength(1)
    expect(emitted[0].payload.properties.delta).toBe("abc")
  })

  test("a non-delta event flushes the pending delta first (order preserved)", () => {
    const { c, emitted } = harness()
    c.handle(delta("p1", "a"))
    c.handle(other())
    expect(emitted).toHaveLength(2)
    expect(emitted[0].payload.type).toBe("message.part.delta")
    expect(emitted[0].payload.properties.delta).toBe("a")
    expect(emitted[1].payload.type).toBe("message.part.updated")
  })

  test("a delta for a different target flushes the previous stream", () => {
    const { c, emitted } = harness()
    c.handle(delta("p1", "a"))
    c.handle(delta("p2", "x"))
    expect(emitted).toHaveLength(1)
    expect(emitted[0].payload.properties.partID).toBe("p1")
    expect(emitted[0].payload.properties.delta).toBe("a")
  })

  test("interleaved fields keep exact order", () => {
    const { c, emitted } = harness()
    c.handle(delta("p1", "t1", "text"))
    c.handle(delta("p1", "r1", "reasoning"))
    c.handle(delta("p1", "t2", "text"))
    c.flush()
    expect(emitted.map((e) => `${e.payload.properties.field}:${e.payload.properties.delta}`)).toEqual([
      "text:t1",
      "reasoning:r1",
      "text:t2",
    ])
  })

  test("merging never mutates the source event", () => {
    const { c, emitted, fireTimer } = harness()
    const first = delta("p1", "a")
    c.handle(first)
    c.handle(delta("p1", "b"))
    fireTimer()
    expect(first.payload.properties.delta).toBe("a")
    expect(emitted[0].payload.properties.delta).toBe("ab")
  })

  test("non-delta passes straight through when nothing buffered", () => {
    const { c, emitted } = harness()
    c.handle(other("message.updated"))
    expect(emitted).toHaveLength(1)
    expect(emitted[0].payload.type).toBe("message.updated")
  })
})
