import { expect, test } from "bun:test"
import { AgentV2 } from "@opencode-ai/core/agent"
import { Location as CoreLocation } from "@opencode-ai/core/location"
import { ModelV2 } from "@opencode-ai/core/model"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionInput as CoreSessionInput } from "@opencode-ai/core/session/input"
import { SessionMessage as CoreSessionMessage } from "@opencode-ai/core/session/message"
import { Prompt as CorePrompt } from "@opencode-ai/core/session/prompt"
import { Agent } from "@opencode-ai/model/agent"
import { Location } from "@opencode-ai/model/location"
import { Model } from "@opencode-ai/model/model"
import { Project } from "@opencode-ai/model/project"
import { Provider } from "@opencode-ai/model/provider"
import { Prompt } from "@opencode-ai/model/prompt"
import { Session } from "@opencode-ai/model/session"
import { SessionInput } from "@opencode-ai/model/session-input"
import { SessionMessage } from "@opencode-ai/model/session-message"
import { Workspace } from "@opencode-ai/model/workspace"
import { SessionGroup } from "@opencode-ai/protocol/session"
import { SessionGroup as ServerSessionGroup } from "@opencode-ai/server/groups/session"

test("Core and Server reuse the authoritative Model and Protocol values", () => {
  expect(AgentV2.ID).toBe(Agent.ID)
  expect(CoreLocation.Ref).toBe(Location.Ref)
  expect(ModelV2.Ref).toBe(Model.Ref)
  expect(SessionV2.Info).toBe(Session.Info)
  expect(CoreSessionInput.Admitted).toBe(SessionInput.Admitted)
  expect(CoreSessionMessage.Message).toBe(SessionMessage.Message)
  expect(CorePrompt).toBe(Prompt)
  expect(ServerSessionGroup).toBe(SessionGroup)
  expect(Session.ID.create()).toStartWith("ses_")
  expect(Session.ID.fromExternal({ namespace: "opencord.agent-thread", key: "thread-1" })).toMatch(/^ses_[a-f0-9]{64}$/)
  expect(Project.ID.global).toBe("global")
  expect(Provider.ID.anthropic).toBe("anthropic")
  expect(Workspace.ID.create()).toStartWith("wrk_")
})
