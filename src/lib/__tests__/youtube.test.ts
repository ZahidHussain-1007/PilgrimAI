import { describe, expect, it } from "vitest"
import { FALLBACK_VIDEO_URL, youtubeEmbedUrl, youtubeVideoId } from "../youtube"

describe("v19 youtube helpers", () => {
  it("extracts ids from youtu.be links (user's provided format)", () => {
    expect(youtubeVideoId("https://youtu.be/8XBPsZNL35U")).toBe("8XBPsZNL35U")
    expect(youtubeEmbedUrl("https://youtu.be/8XBPsZNL35U")).toBe(
      "https://www.youtube-nocookie.com/embed/8XBPsZNL35U?rel=0",
    )
  })

  it("supports watch, shorts and embed forms", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=17ZGsk35W8U")).toBe(
      "17ZGsk35W8U",
    )
    expect(youtubeVideoId("https://www.youtube.com/shorts/AMYpwaQwFKo")).toBe(
      "AMYpwaQwFKo",
    )
    expect(youtubeVideoId("https://www.youtube.com/embed/RSulQ8fr8oI")).toBe(
      "RSulQ8fr8oI",
    )
  })

  it("returns null for junk so the UI can show the dummy video", () => {
    expect(youtubeVideoId("not a url")).toBeNull()
    expect(youtubeEmbedUrl("")).toBeNull()
    expect(youtubeEmbedUrl(undefined)).toBeNull()
  })

  it("fallback is a real playable youtu.be link (Yadadri sample)", () => {
    expect(youtubeEmbedUrl(FALLBACK_VIDEO_URL)).toContain("youtube-nocookie")
  })
})
