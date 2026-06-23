import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { InvalidRequestError, SessionNotFoundError } from "../errors"

export class SessionLocationMiddleware extends HttpApiMiddleware.Service<SessionLocationMiddleware>()(
  "@opencode/HttpApiSessionLocation",
  { error: [InvalidRequestError, SessionNotFoundError] },
) {}
