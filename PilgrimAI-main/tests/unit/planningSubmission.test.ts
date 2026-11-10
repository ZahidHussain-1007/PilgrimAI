import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  planningFetch,
  type PlanningRequest,
  type PlanningJob,
} from "../../src/lib/planning";
import {
  stageSubmission,
  readSubmission,
  submitOnce,
  cancelSubmission,
  submissionIssue,
  previewJob,
  retrySubmission,
} from "../../src/lib/planningSubmission";
vi.mock("../../src/lib/planning", () => ({ planningFetch: vi.fn() }));
const request = {
  temple_ids: ["T0009"],
  primary_temple_id: "T0009",
  days: 1,
  stay: "none",
  stay_mode: "daily_return",
  origin: "Uppal, Hyderabad",
  start_date: "2026-11-04",
} as PlanningRequest;
const job = { id: "saved-job", request, status: "queued" } as PlanningJob;
beforeEach(() => {
  const map = new Map<string, string>();
  vi.stubGlobal("window", {});
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => map.get(k) || null,
    setItem: (k: string, v: string) => map.set(k, v),
  });
  vi.stubGlobal("localStorage", { setItem: vi.fn() });
  vi.mocked(planningFetch).mockReset().mockResolvedValue(job);
});
afterEach(() => vi.unstubAllGlobals());
it("stages synchronously with zero network calls and truthful submitting state", () => {
  const id = stageSubmission(request);
  expect(readSubmission(id)?.request).toEqual(request);
  expect(planningFetch).not.toHaveBeenCalled();
  expect(previewJob(request).stage).toBe("submitting");
  expect(previewJob(request).result).toBeNull();
});
it("explains a one-day overnight contradiction without posting or changing choices", async () => {
  const r = {
    ...request,
    stay_mode: "overnight" as const,
    stay: "hotel" as const,
  };
  const id = stageSubmission(r);
  expect(submissionIssue(r)).toBe("overnightConflict");
  await expect(submitOnce(id)).rejects.toThrow("overnightConflict");
  expect(planningFetch).not.toHaveBeenCalled();
  expect(readSubmission(id)?.request).toEqual(r);
});
it("also rejects overnight without accommodation but accepts a two-day hotel policy", () => {
  expect(submissionIssue({ ...request, days: 2, stay_mode: "overnight" })).toBe(
    "overnightConflict",
  );
  expect(
    submissionIssue({
      ...request,
      days: 2,
      stay_mode: "overnight",
      stay: "hotel",
    }),
  ).toBeNull();
});
it("deduplicates concurrent mounts and saves accepted job ID", async () => {
  const id = stageSubmission(request);
  const a = submitOnce(id),
    b = submitOnce(id);
  expect(a).toBe(b);
  await a;
  expect(planningFetch).toHaveBeenCalledTimes(1);
  expect(readSubmission(id)?.jobId).toBe(job.id);
});
it("retrying an accepted submission resumes its GET rather than a new POST", async () => {
  const id = stageSubmission(request);
  await submitOnce(id);
  await retrySubmission(id);
  expect(planningFetch).toHaveBeenLastCalledWith("jobs/" + job.id);
});
it("keeps rejected request for correction and retries only explicitly", async () => {
  vi.mocked(planningFetch).mockRejectedValueOnce(
    new Error("validationFailure"),
  );
  const id = stageSubmission(request);
  await expect(submitOnce(id)).rejects.toThrow("validationFailure");
  await expect(submitOnce(id)).rejects.toThrow("validationFailure");
  expect(planningFetch).toHaveBeenCalledTimes(1);
  expect(readSubmission(id)?.request).toEqual(request);
  await retrySubmission(id);
  expect(planningFetch).toHaveBeenCalledTimes(2);
});
it("cancels the actual job even if cancellation precedes HTTP acceptance", async () => {
  let resolve!: (j: PlanningJob) => void;
  vi.mocked(planningFetch).mockReturnValueOnce(
    new Promise<PlanningJob>((r) => {
      resolve = r;
    }),
  );
  const id = stageSubmission(request);
  const result = submitOnce(id);
  await cancelSubmission(id);
  resolve(job);
  await expect(result).rejects.toThrow("cancelled");
  expect(planningFetch).toHaveBeenLastCalledWith("jobs/" + job.id, {
    method: "DELETE",
  });
});
