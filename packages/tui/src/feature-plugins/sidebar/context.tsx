import type { AssistantMessage } from "@opencode-ai/sdk/v2"
import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const id = "internal:sidebar-context"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

// Resolve the DeepSeek API key the same way the server does: the `deepseek`
// entry in opencode's auth.json, falling back to the DEEPSEEK_API_KEY env var.
function deepseekKey(): string | undefined {
  try {
    const dir = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")
    const auth = JSON.parse(readFileSync(path.join(dir, "opencode", "auth.json"), "utf8"))
    const entry = auth?.deepseek
    if (entry?.type === "api" && typeof entry.key === "string") return entry.key
  } catch {}
  return process.env.DEEPSEEK_API_KEY
}

// Query DeepSeek's remaining-credit endpoint. Returns null when there is no key
// (i.e. DeepSeek isn't configured) or the request fails, so the sidebar simply
// omits the line rather than erroring.
async function fetchDeepseekBalance(): Promise<string | null> {
  const key = deepseekKey()
  if (!key) return null
  try {
    const res = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    })
    if (!res.ok) return null
    const data = (await res.json()) as { balance_infos?: Array<{ currency: string; total_balance: string }> }
    const info = data.balance_infos?.[0]
    if (!info) return null
    return `${info.total_balance} ${info.currency}`
  } catch {
    return null
  }
}

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const msg = createMemo(() => props.api.state.session.messages(props.session_id))
  const session = createMemo(() => props.api.state.session.get(props.session_id))
  const cost = createMemo(() => session()?.cost ?? 0)

  // Poll DeepSeek remaining credit (null unless DeepSeek is configured + reachable).
  const [balance, setBalance] = createSignal<string | null>(null)
  onMount(() => {
    let cancelled = false
    const refresh = () => fetchDeepseekBalance().then((value) => !cancelled && setBalance(value))
    refresh()
    const timer = setInterval(refresh, 60_000)
    onCleanup(() => {
      cancelled = true
      clearInterval(timer)
    })
  })

  const state = createMemo(() => {
    const last = msg().findLast((item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0)
    if (!last) {
      return {
        tokens: 0,
        percent: null,
      }
    }

    const tokens =
      last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
    const model = props.api.state.provider.find((item) => item.id === last.providerID)?.models[last.modelID]
    return {
      tokens,
      percent: model?.limit.context ? Math.round((tokens / model.limit.context) * 100) : null,
    }
  })

  return (
    <box>
      <text fg={theme().text}>
        <b>Context</b>
      </text>
      <text fg={theme().textMuted}>{state().tokens.toLocaleString()} tokens</text>
      <text fg={theme().textMuted}>{state().percent ?? 0}% used</text>
      <text fg={theme().textMuted}>{money.format(cost())} spent</text>
      {balance() ? <text fg={theme().textMuted}>{balance()} left</text> : null}
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
