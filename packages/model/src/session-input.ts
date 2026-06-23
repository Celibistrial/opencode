export * as SessionInput from "./session-input"

import { Schema } from "effect"
import { Prompt } from "./prompt"
import { DateTimeUtcFromMillis, NonNegativeInt } from "./schema"
import { Session } from "./session"
import { SessionMessage } from "./session-message"

export const Delivery = Schema.Literals(["steer", "queue"])
export type Delivery = typeof Delivery.Type

export class Admitted extends Schema.Class<Admitted>("SessionInput.Admitted")({
  admittedSeq: NonNegativeInt,
  id: SessionMessage.ID,
  sessionID: Session.ID,
  prompt: Prompt,
  delivery: Delivery,
  timeCreated: DateTimeUtcFromMillis,
  promotedSeq: NonNegativeInt.pipe(Schema.optional),
}) {}
