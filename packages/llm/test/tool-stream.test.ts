import { describe, expect, test } from "bun:test"
import { LLMError } from "../src/schema"
import { ToolStream } from "../src/protocols/utils/tool-stream"

const ADAPTER = "test-route"

describe("ToolStream", () => {
  test("starts from OpenAI-style deltas and finalizes parsed input", () => {
    const first = ToolStream.appendOrStart(
      ADAPTER,
      ToolStream.empty<number>(),
      0,
      { id: "call_1", name: "lookup", text: '{"query"' },
      "missing tool",
    )
    if (ToolStream.isError(first)) throw first
    const second = ToolStream.appendOrStart(ADAPTER, first.tools, 0, { text: ':"weather"}' }, "missing tool")
    if (ToolStream.isError(second)) throw second
    const finished = ToolStream.finish(ADAPTER, second.tools, 0)

    expect(first.events).toEqual([
      { type: "tool-input-start", id: "call_1", name: "lookup" },
      { type: "tool-input-delta", id: "call_1", name: "lookup", text: '{"query"' },
    ])
    expect(second.events).toEqual([{ type: "tool-input-delta", id: "call_1", name: "lookup", text: ':"weather"}' }])
    expect(finished).toEqual({
      tools: {},
      events: [
        { type: "tool-input-end", id: "call_1", name: "lookup" },
        { type: "tool-call", id: "call_1", name: "lookup", input: { query: "weather" } },
      ],
    })
  })

  test("fails appendExisting when the provider skipped the tool start", () => {
    const error = ToolStream.appendExisting(ADAPTER, ToolStream.empty<number>(), 0, "{}", "missing tool")

    expect(error).toBeInstanceOf(LLMError)
    if (ToolStream.isError(error)) expect(error.reason.message).toBe("missing tool")
  })

  test("uses final input override without losing accumulated deltas", () => {
    const tools = ToolStream.start(ToolStream.empty<string>(), "item_1", {
      id: "call_1",
      name: "lookup",
      input: '{"query":"partial"}',
    })
    const finished = ToolStream.finishWithInput(ADAPTER, tools, "item_1", '{"query":"final"}')

    expect(finished).toEqual({
      tools: {},
      events: [
        { type: "tool-input-end", id: "call_1", name: "lookup" },
        { type: "tool-call", id: "call_1", name: "lookup", input: { query: "final" } },
      ],
    })
  })

  test("preserves providerExecuted and clears all tools", () => {
    const first: ToolStream.State<number> = ToolStream.start(ToolStream.empty<number>(), 0, {
      id: "call_1",
      name: "lookup",
      input: "{}",
    })
    const tools = ToolStream.start(first, 1, {
      id: "call_2",
      name: "web_search",
      input: '{"query":"docs"}',
      providerExecuted: true,
    })
    const finished = ToolStream.finishAll(ADAPTER, tools)

    expect(finished).toEqual({
      tools: {},
      events: [
        { type: "tool-input-end", id: "call_1", name: "lookup" },
        { type: "tool-call", id: "call_1", name: "lookup", input: {} },
        { type: "tool-input-end", id: "call_2", name: "web_search" },
        {
          type: "tool-call",
          id: "call_2",
          name: "web_search",
          input: { query: "docs" },
          providerExecuted: true,
        },
      ],
    })
  })

  test("throws the typed LLMError on unparseable tool input", () => {
    const tools = ToolStream.start(ToolStream.empty<number>(), 0, { id: "call_1", name: "lookup", input: "{not json" })
    expect(() => ToolStream.finish(ADAPTER, tools, 0)).toThrow(LLMError)
  })
})
