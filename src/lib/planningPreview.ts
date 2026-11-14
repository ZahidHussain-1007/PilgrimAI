export const MIN_PLAYBACK_MS = 3000;
export const READY_VIDEO_FALLBACK_MS = 8000;

export class PlanningPreviewGate {
  private playedMs = 0;
  private playingSince: number | null = null;
  private resultReadyAt: number | null = null;
  private cancelled = false;
  private navigated = false;

  setPlaying(playing: boolean, now: number) {
    this.accumulate(now);
    this.playingSince = playing ? now : null;
  }

  markResultReady(now: number) {
    this.resultReadyAt ??= now;
  }

  playbackDuration(now: number) {
    return (
      this.playedMs +
      (this.playingSince === null ? 0 : Math.max(0, now - this.playingSince))
    );
  }

  resultFallbackRemaining(now: number) {
    if (this.resultReadyAt === null) return Infinity;
    return Math.max(
      0,
      READY_VIDEO_FALLBACK_MS - Math.max(0, now - this.resultReadyAt),
    );
  }

  canNavigate(now: number) {
    return (
      !this.cancelled &&
      !this.navigated &&
      this.resultReadyAt !== null &&
      (this.playbackDuration(now) >= MIN_PLAYBACK_MS ||
        this.resultFallbackRemaining(now) === 0)
    );
  }

  navigateOnce(now: number, navigate: () => void) {
    if (!this.canNavigate(now)) return false;
    this.navigated = true;
    navigate();
    return true;
  }

  cancel() {
    this.cancelled = true;
    this.playingSince = null;
  }

  isPlaying() {
    return this.playingSince !== null;
  }

  private accumulate(now: number) {
    if (this.playingSince !== null) {
      this.playedMs += Math.max(0, now - this.playingSince);
    }
  }
}
