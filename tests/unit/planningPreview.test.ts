import { describe, expect, it, vi } from "vitest";
import {
  MIN_PLAYBACK_MS,
  PlanningPreviewGate,
  READY_VIDEO_FALLBACK_MS,
} from "../../src/lib/planningPreview";
import { loadTemples } from "../../src/lib/temples";
import { youtubeVideoId } from "../../src/lib/youtube";

describe("planning preview gate", () => {
  it("waits for playback when the real result arrives first", () => {
    const gate = new PlanningPreviewGate();
    const navigate = vi.fn();
    gate.markResultReady(100);
    expect(gate.navigateOnce(100, navigate)).toBe(false);
    gate.setPlaying(true, 200);
    expect(gate.navigateOnce(200 + MIN_PLAYBACK_MS - 1, navigate)).toBe(false);
    expect(gate.navigateOnce(200 + MIN_PLAYBACK_MS, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("navigates immediately when playback already reached the minimum", () => {
    const gate = new PlanningPreviewGate();
    const navigate = vi.fn();
    gate.setPlaying(true, 0);
    gate.setPlaying(false, MIN_PLAYBACK_MS);
    gate.markResultReady(5000);
    expect(gate.navigateOnce(5000, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("does not count paused or buffering intervals", () => {
    const gate = new PlanningPreviewGate();
    gate.setPlaying(true, 0);
    gate.setPlaying(false, 1000);
    gate.setPlaying(true, 5000);
    gate.setPlaying(false, 7000);
    gate.markResultReady(7000);
    expect(gate.playbackDuration(7000)).toBe(3000);
    expect(gate.navigateOnce(7000, vi.fn())).toBe(true);

    const paused = new PlanningPreviewGate();
    paused.setPlaying(true, 0);
    paused.setPlaying(false, 1000);
    paused.markResultReady(10000);
    expect(paused.playbackDuration(10000)).toBe(1000);
    expect(paused.navigateOnce(10000, vi.fn())).toBe(false);
  });

  it("releases a ready result after blocked or failed playback fallback", () => {
    const gate = new PlanningPreviewGate();
    gate.markResultReady(50000);
    // Neither a blocked autoplay attempt nor a failed source reports PLAYING.
    gate.setPlaying(false, 50000);
    expect(
      gate.navigateOnce(50000 + READY_VIDEO_FALLBACK_MS - 1, vi.fn()),
    ).toBe(false);
    expect(
      gate.navigateOnce(50000 + READY_VIDEO_FALLBACK_MS, vi.fn()),
    ).toBe(true);
  });

  it("allows an already-completed idempotently reused job through the same gate", () => {
    const gate = new PlanningPreviewGate();
    const navigate = vi.fn();
    gate.markResultReady(0);
    gate.setPlaying(true, 10);
    expect(gate.navigateOnce(10 + MIN_PLAYBACK_MS, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("does not navigate after cancellation or more than once", () => {
    const cancelled = new PlanningPreviewGate();
    const staleNavigate = vi.fn();
    cancelled.markResultReady(0);
    cancelled.cancel();
    cancelled.setPlaying(true, 1);
    expect(cancelled.navigateOnce(1 + MIN_PLAYBACK_MS, staleNavigate)).toBe(
      false,
    );
    expect(staleNavigate).not.toHaveBeenCalled();

    const gate = new PlanningPreviewGate();
    const navigate = vi.fn();
    gate.markResultReady(0);
    gate.setPlaying(true, 0);
    expect(gate.navigateOnce(MIN_PLAYBACK_MS, navigate)).toBe(true);
    expect(gate.navigateOnce(MIN_PLAYBACK_MS + 1, navigate)).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});

it("uses the mapped YouTube fallback when a temple has no owned video file", () => {
  const chilkur = loadTemples().find((temple) => temple.templeId === "T0008");
  expect(chilkur).toBeDefined();
  expect(chilkur?.videoFile).toBeNull();
  expect(youtubeVideoId(chilkur?.videoUrl)).toBeTruthy();
});
