import { BadRequestError } from "./errors"

export async function parseJsonBody<T = unknown>(request: Request): Promise<T> {
  try {
    const text = await request.text()
    if (!text.trim()) {
      throw new BadRequestError("Request body cannot be empty")
    }
    return JSON.parse(text) as T
  } catch (error) {
    if (error instanceof BadRequestError) throw error
    throw new BadRequestError("Invalid JSON in request body")
  }
}

export function getQueryParam(request: Request, key: string): string | null {
  const url = new URL(request.url)
  return url.searchParams.get(key)
}

export function getQueryParams(request: Request): Record<string, string> {
  const url = new URL(request.url)
  const params: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    params[key] = value
  })
  return params
}
