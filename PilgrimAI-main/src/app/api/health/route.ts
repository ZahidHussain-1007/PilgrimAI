import { multiAgentClient } from "@/services/ai/multiagent.client"

export async function GET() {
  const multiagent = await multiAgentClient.checkHealth()
  const status = multiagent.isHealthy ? "ok" : "degraded"

  return Response.json({
    status,
    services: {
      api: "ok",
      multiagent: {
        status: multiagent.status,
        healthy: multiagent.isHealthy,
        ...(multiagent.detail ? { detail: multiagent.detail } : {}),
      },
    },
  })
}
