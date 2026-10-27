import { multiAgentClient, type MultiAgentClient, type MultiAgentChatResponse } from "./multiagent.client"
import { researchService, type TempleInfo } from "../research/research.service"
import type { Message, MessageSource, TripCreated } from "../../types/domain/models"

export interface GenerateOptions {
  message: string
  conversationId?: string
  userId?: string
  temple?: string
  language?: string
}

export class AiService {
  private client: MultiAgentClient

  constructor(client: MultiAgentClient = multiAgentClient) {
    this.client = client
  }

  async generateResponse(options: GenerateOptions): Promise<Message> {
    const { message, conversationId = "default" } = options

    // Check if fallback is explicitly forced (e.g. for offline testing)
    if (process.env.MULTIAGENT_ENABLE_FALLBACK === "true") {
      return this.generateFallbackResponse(options)
    }

    try {
      const response = await this.client.sendChat(
        message,
        conversationId !== "default" ? conversationId : undefined,
      )

      return this.mapMultiAgentResponse(response, {
        conversationId,
        userId: options.userId,
      })
    } catch (error) {
      // If fallback is enabled on error
      if (process.env.MULTIAGENT_FALLBACK_ON_ERROR === "true") {
        return this.generateFallbackResponse(options)
      }
      throw error
    }
  }

  mapMultiAgentResponse(
    response: MultiAgentChatResponse,
    context: { conversationId: string; userId?: string },
  ): Message {
    const sources: MessageSource[] = []
    const seenSources = new Set<string>()

    if (Array.isArray(response.evidence)) {
      for (const item of response.evidence) {
        if (!item || typeof item !== "object") continue
        const label = (item.name || item.source || item.provider || item.role || (item.kind ? `Source (${item.kind})` : "")) as string
        const href = typeof item.url === "string" && item.url.startsWith("http") ? item.url : undefined
        const key = `${label}:${href || ""}`
        if (label && !seenSources.has(key)) {
          seenSources.add(key)
          sources.push({ label: String(label).slice(0, 100), href })
        }
      }
    }

    const followUpQuestions: string[] = []
    if (response.clarification) {
      followUpQuestions.push(response.clarification)
    } else {
      switch (response.category) {
        case "temple_info":
          followUpQuestions.push(
            "What are the darshan timings and entry fees?",
            "What is the dress code and special sevas?",
            "How do I reach the temple from Hyderabad?",
          )
          break
        case "travel":
          followUpQuestions.push(
            "What are the bus and transit options?",
            "Can you estimate the total travel distance and fuel cost?",
            "Are there comfortable accommodations nearby?",
          )
          break
        case "accommodation":
          followUpQuestions.push(
            "What are the best budget-friendly hotels?",
            "Are there accommodations near the temple entrance?",
            "What are good places to eat nearby?",
          )
          break
        case "budget":
          followUpQuestions.push(
            "Can you break down the accommodation and food expenses?",
            "What are the special darshan and seva fees?",
            "How can I plan this pilgrimage on a tighter budget?",
          )
          break
        default:
          followUpQuestions.push(
            "Tell me about temple darshan timings",
            "How do I plan a pilgrimage trip?",
            "What are the accommodation and stay options?",
          )
      }
    }

    return {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      conversationId: context.conversationId,
      userId: context.userId,
      role: "assistant",
      content: response.reply,
      sources: sources.length > 0 ? sources : undefined,
      followUpQuestions: followUpQuestions.length > 0 ? followUpQuestions : undefined,
      createdAt: new Date().toISOString(),
    }
  }

  private generateFallbackResponse(options: GenerateOptions): Message {
    const { message, conversationId = "default", temple } = options
    const query = (temple || message).toLowerCase()

    const matchedTemple = researchService.findTemple(query)

    let content = ""
    const sources: MessageSource[] = []
    const followUpQuestions: string[] = []
    let trip: TripCreated | undefined = undefined

    if (matchedTemple) {
      sources.push({
        label: `${matchedTemple.name} Devastanam Official Guide`,
        href: `https://telanganatourism.gov.in/temples/${matchedTemple.id}`,
      })

      content = this.composeTempleGuidance(matchedTemple, message)

      followUpQuestions.push(
        `What are the special sevas at ${matchedTemple.name}?`,
        `How do I reach ${matchedTemple.name} from Hyderabad?`,
        `What is the best time of year to visit?`,
      )

      if (
        message.toLowerCase().includes("plan") ||
        message.toLowerCase().includes("trip") ||
        message.toLowerCase().includes("itinerary") ||
        message.toLowerCase().includes("visit")
      ) {
        trip = {
          id: `trip-${Date.now()}`,
          title: `Pilgrimage to ${matchedTemple.name}`,
          destinations: [matchedTemple.location],
          dateSummary: "Upcoming Weekend (2 Days)",
          description: `A 2-day pilgrimage featuring Suprabhatam darshan, sacred pradakshina, and peaceful stays.`,
        }
      }
    } else {
      content =
        "Welcome to PilgrimAI. I can assist you with darshan timings, temple rituals, dress codes, accommodations, and itinerary planning for sacred pilgrimage destinations including Yadadri, Vemulawada, Bhadrachalam, Basar, and Tirupati. Where would you like to travel?"
      followUpQuestions.push(
        "Tell me about Yadadri darshan timings",
        "How do I plan a 2-day trip to Bhadrachalam?",
        "What are the rules and dress code for Tirumala darshan?",
      )
    }

    return {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      conversationId,
      userId: options.userId,
      role: "assistant",
      content,
      sources: sources.length > 0 ? sources : undefined,
      followUpQuestions: followUpQuestions.length > 0 ? followUpQuestions : undefined,
      trip,
      createdAt: new Date().toISOString(),
    }
  }

  private composeTempleGuidance(temple: TempleInfo, query: string): string {
    const q = query.toLowerCase()

    if (q.includes("timing") || q.includes("time") || q.includes("darshan")) {
      return `**${temple.name} (${temple.deity})**\n\n- **Location:** ${temple.location}\n- **Darshan Timings:** ${temple.darshanTimings}\n- **Dress Code:** ${temple.dressCode}\n\n**Key Rituals:**\n${temple.rituals.map((r) => `• ${r.name}: ${r.time}${r.fee ? ` (${r.fee})` : ""}`).join("\n")}\n\n*Pilgrim Advice:* ${temple.accommodationTips}`
    }

    if (q.includes("reach") || q.includes("how to go") || q.includes("travel") || q.includes("route")) {
      return `**Travel Guide to ${temple.name}**\n\n- **Nearest Railway:** ${temple.nearestTransit.railway || "Nearby district station"}\n- **Nearest Airport:** ${temple.nearestTransit.airport || "Hyderabad RGI Airport"}\n- **Road / Bus Transit:** ${temple.nearestTransit.bus || "Regular state RTC buses available"}\n\n**Darshan Hours:** ${temple.darshanTimings}\n**Dress Code:** ${temple.dressCode}`
    }

    return `**${temple.name}**\n\n${temple.description}\n\n- **Deity:** ${temple.deity}\n- **Location:** ${temple.location}, ${temple.state}\n- **Darshan Timings:** ${temple.darshanTimings}\n- **Dress Code:** ${temple.dressCode}\n- **Major Festivals:** ${temple.majorFestivals.join(", ")}\n\n**Transit Information:**\n• Railway: ${temple.nearestTransit.railway || "N/A"}\n• Road: ${temple.nearestTransit.bus || "RTC buses available"}\n\n*Accommodation:* ${temple.accommodationTips}`
  }
}

export const aiService = new AiService()
