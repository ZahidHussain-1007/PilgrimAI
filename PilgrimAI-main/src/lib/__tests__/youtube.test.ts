import { describe, expect, it } from "vitest"
import {
  FALLBACK_VIDEO_URL,
  youtubeEmbedUrl,
  youtubeVideoId,
} from "../youtube";

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

import { requestHighestVideoQuality } from "../youtube";
it("requests the highest offered video quality but reports actual/adaptive quality honestly", () => {
  const requested: string[] = [];
  expect(
    requestHighestVideoQuality({
      getAvailableQualityLevels: () => ["hd720", "hd1080", "medium"],
      setPlaybackQuality: (q) => requested.push(q),
      getPlaybackQuality: () => "hd720",
    }),
  ).toBe("hd720");
  expect(requested).toEqual(["hd1080"]);
  expect(requestHighestVideoQuality({})).toBe("adaptive");
  expect(
    requestHighestVideoQuality({
      getAvailableQualityLevels: () => {
        throw new Error("unsupported");
      },
    }),
  ).toBe("adaptive");
});

import { YOUTUBE_EMBED_PARAMS } from "../youtube";

describe("v23.1 official embed parameters", () => {
  it("sets only parameters YouTube still documents", () => {
    expect(YOUTUBE_EMBED_PARAMS.fs).toBe(0) // YouTube fullscreen button off
    expect(YOUTUBE_EMBED_PARAMS.cc_load_policy).toBe(0) // captions not forced on
    expect(YOUTUBE_EMBED_PARAMS.iv_load_policy).toBe(3) // no annotations
    expect(YOUTUBE_EMBED_PARAMS.controls).toBe(0) // no YouTube control bar
    expect(YOUTUBE_EMBED_PARAMS.rel).toBe(0)
    expect(YOUTUBE_EMBED_PARAMS.mute).toBe(1) // required for autoplay
    expect(YOUTUBE_EMBED_PARAMS.autoplay).toBe(1)
    expect(YOUTUBE_EMBED_PARAMS.playsinline).toBe(1)
  })

  it("does not re-introduce retired parameters that imply false guarantees", () => {
    for (const dead of ["modestbranding", "vq", "suggestedQuality", "showinfo"]) {
      expect(YOUTUBE_EMBED_PARAMS).not.toHaveProperty(dead);
    }
  })
});
