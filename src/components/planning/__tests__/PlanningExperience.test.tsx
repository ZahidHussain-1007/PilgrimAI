import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanningExperience } from "../PlanningExperience";
import { youtubePlayerVars } from "../../plan/TempleVideoPlayer";
import type { TempleSummary } from "../../../lib/temples";
import type { PlanningJob } from "../../../lib/planning";

const job = {
  id: "00000000-0000-4000-8000-000000000001",
  status: "running",
  stage: "temples",
  created_at: "2026-11-12T00:00:00Z",
  version: 1,
  title: "Test itinerary",
  request: {
    temple_ids: ["T0003"],
    primary_temple_id: "T0003",
    origin: "Hyderabad",
    start_date: "2026-11-12",
    days: 1,
    departure: "06:00",
    finish: "20:00",
    adults: 1,
    children: 0,
    elderly: 0,
    transport: "car",
    stay: "none",
    food: "any",
    special: "none",
    budget_tier: "mid",
    budget_cap: null,
    rooms: 1,
    visit_minutes: 60,
    rest_minutes: 0,
    priorities: [],
    include_attractions: false,
    language: "en",
    allow_estimates: true,
  },
  result: null,
} satisfies PlanningJob;

const temple = {
  templeId: "T0003",
  name: "Sri Raja Rajeshwara Swamy Devasthanam",
  city: "Vemulawada",
  district: "Rajanna Sircilla",
  deity: "Shiva",
  category: "Temple",
  rating: null,
  reviewCount: null,
  lat: 18.4655,
  lon: 78.8689,
  videoUrls: ["https://youtu.be/7Ba5NjWPnyI"],
  videoUrl: "https://youtu.be/7Ba5NjWPnyI",
  videoFile: null,
  image: null,
  summary: "",
  darshanHours: null,
} satisfies TempleSummary;

describe("planning experience video controls", () => {
  it("passes controls=0 to the actual waiting-screen YT.Player configuration", () => {
    expect(youtubePlayerVars(true)).toMatchObject({ controls: 0 });
    expect(youtubePlayerVars(false)).toMatchObject({ controls: 1 });
  });

  it("uses the official YouTube player and keeps Watch on YouTube as the app toolbar item", () => {
    const markup = renderToStaticMarkup(
      <PlanningExperience
        fullscreen
        job={job}
        temples={[temple]}
        onCancel={() => {}}
      />,
    );

    expect(markup).toContain('data-engine="youtube"');
    expect(markup).toContain(
      'href="https://www.youtube.com/watch?v=7Ba5NjWPnyI"',
    );
    expect(markup).toContain(
      '<div class="absolute bottom-4 left-1/2 z-20 -translate-x-1/2" data-player-controls="true"><a',
    );
    expect(markup).toContain("Watch on YouTube");
    expect(markup).not.toContain("data-player-accessibility-controls");
    expect(markup).not.toContain("Pause video");
    expect(markup).toContain("w-[min(100vw,177.7778dvh)]");
    expect(markup).toContain("radial-gradient");
    expect(markup).toContain('data-provider-controls="0"');
    expect(markup).toContain("left-5 top-16");
    expect(markup).toContain("left-1/2 top-56");
    expect(markup).toContain("md:top-[clamp(60px,8vh,96px)]");
    expect(markup).toContain('data-planning-status="true"');
    expect(markup).toContain("text-[#FBBF24]");
  });

  it("uses provider playback controls in the journey-details preview too", () => {
    const markup = renderToStaticMarkup(
      <PlanningExperience
        job={job}
        temples={[temple]}
        onCancel={() => {}}
      />,
    );

    expect(markup).toContain("aspect-video");
    expect(markup).not.toContain('data-player-controls');
    expect(markup).not.toContain("data-player-accessibility-controls");
    expect(markup).toContain(
      'href="https://www.youtube.com/watch?v=7Ba5NjWPnyI"',
    );
  });

  it("uses the HTML5 player for a temple-owned video file", () => {
    const markup = renderToStaticMarkup(
      <PlanningExperience
        fullscreen
        job={job}
        temples={[{ ...temple, videoFile: "/videos/vemulawada.mp4" }]}
        onCancel={() => {}}
      />,
    );

    expect(markup).toContain('data-engine="html5"');
    expect(markup).toContain('data-video-id="file:/videos/vemulawada.mp4"');
    expect(markup).toContain('src="/videos/vemulawada.mp4"');
    expect(markup).not.toContain("Watch on YouTube");
  });
});
