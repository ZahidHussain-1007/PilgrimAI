import { NextResponse } from "next/server"
import { isApiError } from "./errors"

export function jsonResponse<T>(data: T, status = 200, headers?: HeadersInit) {
  return NextResponse.json(data, { status, headers })
}

export function success<T>(data: T, status = 200) {
  return jsonResponse(data, status)
}

export function created<T>(data: T) {
  return jsonResponse(data, 201)
}

export function noContent() {
  return new NextResponse(null, { status: 204 })
}

export function errorResponse(error: unknown) {
  if (isApiError(error)) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details,
      },
      { status: error.status },
    )
  }

  const message =
    error instanceof Error ? error.message : "An unexpected error occurred"
  return NextResponse.json(
    {
      error: message,
      code: "INTERNAL_SERVER_ERROR",
    },
    { status: 500 },
  )
}
