export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export class BadRequestError extends ApiError {
  constructor(message = "Bad request", details?: unknown) {
    super(message, 400, "BAD_REQUEST", details)
    this.name = "BadRequestError"
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED")
    this.name = "UnauthorizedError"
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN")
    this.name = "ForbiddenError"
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND")
    this.name = "NotFoundError"
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Conflict") {
    super(message, 409, "CONFLICT")
    this.name = "ConflictError"
  }
}

export class InternalServerError extends ApiError {
  constructor(message = "Internal server error") {
    super(message, 500, "INTERNAL_SERVER_ERROR")
    this.name = "InternalServerError"
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
