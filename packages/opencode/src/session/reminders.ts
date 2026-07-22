import path from "path"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect } from "effect"
import { Agent } from "@/agent/agent"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { PartID, MessageID } from "./schema"
import { MessageV2 } from "./message-v2"
import { Session } from "./session"
import PROMPT_PLAN from "./prompt/plan.txt"
import BUILD_SWITCH from "./prompt/build-switch.txt"
import PLAN_MODE from "./prompt/plan-mode.txt"

export const apply = Effect.fn("SessionReminders.apply")(function* (input: {
  messages: SessionV1.WithParts[]
  agent: Agent.Info
  session: Session.Info
}) {
  const flags = yield* RuntimeFlags.Service
  const fsys = yield* FSUtil.Service
  const sessions = yield* Session.Service
  const userMessage = input.messages.findLast((msg) => msg.info.role === "user")
  if (!userMessage) return input.messages

  if (!flags.experimentalPlanMode) {
    // Emit reminders on a fresh, ephemeral trailing user message instead of
    // mutating the real last user message. The reminder text is never
    // persisted, so the real (DB-backed) messages stay byte-identical across
    // turns and remain a stable provider prompt-cache prefix. This synthetic
    // message only ever rides the moving tail, which is regenerated each turn.
    const reminderMessageID = MessageID.ascending()
    const reminders: SessionV1.Part[] = []
    const addReminder = (text: string) =>
      reminders.push({
        id: PartID.ascending(),
        messageID: reminderMessageID,
        sessionID: userMessage.info.sessionID,
        type: "text",
        text,
        synthetic: true,
      })
    if (input.agent.name === "plan") addReminder(PROMPT_PLAN)
    const wasPlan = input.messages.some((msg) => msg.info.role === "assistant" && msg.info.agent === "plan")
    if (wasPlan && input.agent.name === "build") addReminder(BUILD_SWITCH)
    if (reminders.length === 0) return input.messages
    return [...input.messages, { info: { ...userMessage.info, id: reminderMessageID }, parts: reminders }]
  }

  const assistantMessage = input.messages.findLast((msg) => msg.info.role === "assistant")
  if (input.agent.name !== "plan" && assistantMessage?.info.agent === "plan") {
    const ctx = yield* InstanceState.context
    const plan = Session.plan(input.session, ctx)
    const exists = yield* fsys.existsSafe(plan)
    // A prior loop step may have already persisted this reminder on the user
    // message. Reuse its part id so updatePart updates it in place instead of
    // appending a duplicate synthetic part every iteration.
    const existing = userMessage.parts.find(
      (p) => p.type === "text" && p.synthetic === true && p.text.startsWith(BUILD_SWITCH),
    )
    const part = yield* sessions.updatePart({
      id: existing?.id ?? PartID.ascending(),
      messageID: userMessage.info.id,
      sessionID: userMessage.info.sessionID,
      type: "text",
      text: exists
        ? `${BUILD_SWITCH}\n\nA plan file exists at ${plan}. You should execute on the plan defined within it`
        : BUILD_SWITCH,
      synthetic: true,
    })
    if (existing) Object.assign(existing, part)
    else userMessage.parts.push(part)
    return input.messages
  }

  if (input.agent.name !== "plan" || assistantMessage?.info.agent === "plan") return input.messages

  const ctx = yield* InstanceState.context
  const plan = Session.plan(input.session, ctx)
  const exists = yield* fsys.existsSafe(plan)
  if (!exists) yield* fsys.ensureDir(path.dirname(plan)).pipe(Effect.catch(Effect.die))
  // Stable prefix of the plan-mode reminder (everything before the interpolated
  // plan-file info), used to detect a copy persisted by an earlier loop step so
  // we update it in place rather than appending a duplicate every iteration.
  const planModeMarker = PLAN_MODE.slice(0, PLAN_MODE.indexOf("${planInfo}"))
  const existing = userMessage.parts.find(
    (p) => p.type === "text" && p.synthetic === true && p.text.startsWith(planModeMarker),
  )
  const part = yield* sessions.updatePart({
    id: existing?.id ?? PartID.ascending(),
    messageID: userMessage.info.id,
    sessionID: userMessage.info.sessionID,
    type: "text",
    text: PLAN_MODE.replace("${planInfo}", () =>
      exists
        ? `A plan file already exists at ${plan}. You can read it and make incremental edits using the edit tool.`
        : `No plan file exists yet. You should create your plan at ${plan} using the write tool.`,
    ),
    synthetic: true,
  })
  if (existing) Object.assign(existing, part)
  else userMessage.parts.push(part)
  return input.messages
})

export * as SessionReminders from "./reminders"
