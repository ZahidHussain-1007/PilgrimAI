export type MessageSource = { label: string; href?: string }
export type TripCreatedViewModel = {
  id?: string
  title?: string
  destinations?: string[]
  dateSummary?: string
  description?: string
}
export type Message = {
  id: string
  conversationId?: string
  role: "user" | "assistant"
  content?: string
  createdAt?: string
  sources?: MessageSource[]
  followUpQuestions?: string[]
  trip?: TripCreatedViewModel
}
