import {
  planningFetch,
  type PlanningJob,
  type PlanningRequest,
} from "./planning";
const PREFIX = "pilgrim:submission:";
export const EDIT_REQUEST = "pilgrim:planning:edit";
type Submission = {
  request: PlanningRequest;
  created: number;
  jobId?: string;
  cancelled?: boolean;
};
const active = new Map<string, Promise<PlanningJob>>();
export function readSubmission(id: string): Submission | null {
  if (typeof window === "undefined") return null;
  try {
    const s = JSON.parse(
      sessionStorage.getItem(PREFIX + id) || "null",
    ) as Submission | null;
    return s && Date.now() - s.created < 3600000 ? s : null;
  } catch {
    return null;
  }
}
function save(id: string, s: Submission) {
  sessionStorage.setItem(PREFIX + id, JSON.stringify(s));
}
export function stageSubmission(request: PlanningRequest) {
  const id = "submit-" + crypto.randomUUID();
  save(id, { request, created: Date.now() });
  return id;
}
export function submissionIssue(request: PlanningRequest) {
  return request.stay_mode === "overnight" &&
    (request.days < 2 || request.stay === "none")
    ? "overnightConflict"
    : null;
}
export function previewJob(request: PlanningRequest): PlanningJob {
  // Presentation only: no backend job or completion is asserted before HTTP 202.
  return {
    id: "pending",
    request,
    status: "queued",
    stage: "submitting",
    version: 0,
    created_at: "",
    title: "",
    result: null,
  };
}
export function submitOnce(id: string): Promise<PlanningJob> {
  const running = active.get(id);
  if (running) return running;
  const s = readSubmission(id);
  if (!s || s.cancelled) return Promise.reject(new Error("submissionMissing"));
  const issue = submissionIssue(s.request);
  if (issue) return Promise.reject(new Error(issue));
  const task = (
    s.jobId
      ? planningFetch<PlanningJob>("jobs/" + s.jobId)
      : planningFetch<PlanningJob>("jobs", {
          method: "POST",
          body: JSON.stringify(s.request),
        })
  ).then(async (job) => {
    const latest = readSubmission(id) || s;
    save(id, { ...latest, jobId: job.id });
    if (latest.cancelled) {
      await planningFetch("jobs/" + job.id, { method: "DELETE" });
      throw new Error("cancelled");
    }
    try {
      localStorage.setItem("pilgrim:active_plan", job.id);
    } catch {}
    return job;
  });
  active.set(id, task);
  return task;
}
export function retrySubmission(id: string) {
  active.delete(id);
  return submitOnce(id);
}
export async function cancelSubmission(id: string) {
  const s = readSubmission(id);
  if (!s) return;
  save(id, { ...s, cancelled: true });
  if (s.jobId) await planningFetch("jobs/" + s.jobId, { method: "DELETE" });
}
export function editRequest(request: PlanningRequest) {
  sessionStorage.setItem(EDIT_REQUEST, JSON.stringify(request));
}
