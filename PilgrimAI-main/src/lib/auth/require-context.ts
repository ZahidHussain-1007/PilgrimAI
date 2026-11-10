import { UnauthorizedError } from "../api/errors"
import { getAuthContext, type AuthUser } from "./context"

export async function requireAuthContext(): Promise<{
  user: AuthUser
  isAuthenticated: true
}> {
  const context = await getAuthContext()
  if (!context.isAuthenticated || !context.user) {
    throw new UnauthorizedError("You must be signed in to perform this action")
  }
  return {
    user: context.user,
    isAuthenticated: true,
  }
}
