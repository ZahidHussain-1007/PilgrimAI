import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash, createHmac } from "node:crypto";
import { GET, POST } from "../../src/app/api/planning/[...path]/route";
import { getAuthContext } from "../../src/lib/auth/context";
import { cookies } from "next/headers";
vi.mock("../../src/lib/auth/context", () => ({ getAuthContext: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
const key = "unit-test-only-planning-proxy-secret";
const anonymous = "11111111-1111-4111-8111-111111111111";
const job = "22222222-2222-4222-8222-222222222222";
const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("PLAN_SERVICE_SECRET", key);
  vi.mocked(getAuthContext).mockResolvedValue({
    user: null,
    isAuthenticated: false,
  });
  vi.mocked(cookies).mockResolvedValue({
    get: () => ({ value: anonymous }),
  } as never);
  fetcher = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ id: job }), {
      status: 202,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("signed planning gateway", () => {
  it("derives owner from HttpOnly session rather than any forged header and signs exact bytes", async () => {
    const body = JSON.stringify({ origin: "వరంగల్" });
    const response = await POST(
      new Request("https://app.example/api/planning/jobs", {
        method: "POST",
        body,
        headers: { "X-Plan-Owner": "forged" },
      }),
      ctx(["jobs"]),
    );
    expect(response.status).toBe(202);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toContain("/planning/jobs");
    const owner = createHmac("sha256", key)
      .update("anonymous:" + anonymous)
      .digest("hex");
    const stamp = init.headers["X-Plan-Time"];
    const signature = createHmac("sha256", key)
      .update(
        [
          stamp,
          owner,
          "POST",
          "/planning/jobs",
          createHash("sha256").update(body).digest("hex"),
        ].join("\n"),
      )
      .digest("hex");
    expect(init.headers["X-Plan-Owner"]).toBe(owner);
    expect(init.headers["X-Plan-Signature"]).toBe(signature);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("binds a signed-in account to verified user ID, not anonymous cookie", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      user: { id: "verified-user" },
      isAuthenticated: true,
    });
    const response = await GET(
      new Request("https://app.example/api/planning/jobs"),
      ctx(["jobs"]),
    );
    expect(fetcher.mock.calls[0][1].headers["X-Plan-Owner"]).toBe(
      createHmac("sha256", key).update("user:verified-user").digest("hex"),
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it.each([["secret"], ["jobs", "../../secret"], ["jobs", job, "unknown"]])(
    "rejects non-allowlisted route %s",
    async (...parts) => {
      const res = await GET(
        new Request("https://app.example/api/planning/x"),
        ctx(parts as string[]),
      );
      expect(res.status).toBe(404);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("rejects incorrect method", async () => {
    expect(
      (
        await GET(
          new Request("https://app.example/api/planning/discover"),
          ctx(["discover"]),
        )
      ).status,
    ).toBe(404);
  });
  it.each(["[]", "null", "{broken"])(
    "requires an object JSON body %s",
    async (body) => {
      const res = await POST(
        new Request("https://app.example/api/planning/jobs", {
          method: "POST",
          body,
        }),
        ctx(["jobs"]),
      );
      expect(res.status).toBe(400);
    },
  );
  it("enforces body limit in UTF-8 bytes rather than JavaScript character count", async () => {
    const body = JSON.stringify({ message: "త".repeat(5500) });
    expect(body.length).toBeLessThan(16000);
    const res = await POST(
      new Request("https://app.example/api/planning/jobs", {
        method: "POST",
        body,
      }),
      ctx(["jobs"]),
    );
    expect(res.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("preserves upstream ownership denial and does not report success", async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Itinerary not found" }), {
        status: 404,
      }),
    );
    const res = await GET(
      new Request("https://app.example/api/planning/jobs/" + job),
      ctx(["jobs", job]),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Itinerary not found" });
  });
  it("handles unavailable backend honestly", async () => {
    fetcher.mockRejectedValue(new Error("offline"));
    expect(
      (
        await GET(
          new Request("https://app.example/api/planning/jobs"),
          ctx(["jobs"]),
        )
      ).status,
    ).toBe(503);
  });
  it("rejects cross-origin state-changing requests before signing", async () => {
    const response = await POST(
      new Request("https://app.example/api/planning/jobs", {
        method: "POST",
        body: "{}",
        headers: { origin: "https://attacker.example" },
      }),
      ctx(["jobs"]),
    );
    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
it("does not echo Pydantic input payloads or raw JSON for 422 errors", async () => {
  fetcher.mockResolvedValue(
    new Response(
      JSON.stringify({
        detail: [
          { msg: "contradiction", input: { origin: "private-test-input" } },
        ],
      }),
      { status: 422 },
    ),
  );
  const response = await POST(
    new Request("https://app.example/api/planning/jobs", {
      method: "POST",
      body: "{}",
    }),
    ctx(["jobs"]),
  );
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: "validationFailure" });
});
