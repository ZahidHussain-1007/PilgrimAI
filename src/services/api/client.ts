export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export function apiUrl(path: string) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`
  return cleanPath.startsWith("/api/") || cleanPath === "/api"
    ? cleanPath
    : `/api${cleanPath}`
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = apiUrl(path)
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError(
      "Unable to reach the service. Check your connection and try again.",
    )
  }
  if (!response.ok) {
    let message = `The request could not be completed (${response.status}).`
    try {
      const errorData = await response.json()
      if (errorData && typeof errorData.error === "string") {
        message = errorData.error
      } else if (errorData && typeof errorData.detail === "string") {
        message = errorData.detail
      }
    } catch {
      // Use fallback message
    }
    throw new ApiError(message, response.status)
  }
  if (response.status === 204) return undefined as T
  try {
    return (await response.json()) as T
  } catch {
    throw new ApiError("The service returned an unreadable response.")
  }
}
