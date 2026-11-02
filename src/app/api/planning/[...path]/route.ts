import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getAuthContext } from "@/lib/auth/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const COOKIE = "pilgrim_planning_owner";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function secret() {
  const configured = process.env.PLAN_SERVICE_SECRET;
  if (configured) {
    if (configured.length < 32)
      throw new Error(
        "PLAN_SERVICE_SECRET must contain at least 32 characters.",
      );
    return configured;
  }
  // Local single-host setup only. Production must explicitly share a secret.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.PLAN_ALLOW_LOCAL_KEY !== "true"
  )
    throw new Error(
      "Configure PLAN_SERVICE_SECRET for planning, or PLAN_ALLOW_LOCAL_KEY=true for a local single-host installation.",
    );
  const dir = path.join(process.cwd(), ".planning-runtime");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "proxy.key");
  try {
    await fs.writeFile(file, randomBytes(32).toString("hex"), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  }
  return fs.readFile(file, "utf8");
}

type Context = { params: Promise<{ path: string[] }> };
async function proxy(request: Request, ctx: Context) {
  const { path: parts } = await ctx.params;
  const valid =
    (parts.length === 1 && ["jobs", "discover"].includes(parts[0])) ||
    (parts.length === 2 && parts[0] === "jobs" && UUID.test(parts[1])) ||
    (parts.length === 3 &&
      parts[0] === "jobs" &&
      UUID.test(parts[1]) &&
      parts[2] === "chat");
  const methods =
    parts[0] === "discover" || parts[2] === "chat"
      ? ["POST"]
      : parts.length === 1
        ? ["GET", "POST"]
        : ["GET", "DELETE"];
  if (!valid || !methods.includes(request.method))
    return NextResponse.json(
      { error: "Unsupported planning endpoint." },
      { status: 404 },
    );
  const origin = request.headers.get("origin");
  if (origin && request.method !== "GET") {
    try {
      const host = request.headers.get("host") || new URL(request.url).host;
      if (new URL(origin).host !== host)
        return NextResponse.json(
          { error: "Cross-origin planning requests are not allowed." },
          { status: 403 },
        );
    } catch {
      return NextResponse.json(
        { error: "Invalid request origin." },
        { status: 400 },
      );
    }
  }
  let body = "";
  if (request.method === "POST") {
    if (Number(request.headers.get("content-length") || 0) > 16000)
      return NextResponse.json(
        { error: "Request is too large." },
        { status: 413 },
      );
    const chunks: Uint8Array[] = [];
    const reader = request.body?.getReader();
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.byteLength;
          if (size > 16000) {
            await reader.cancel();
            return NextResponse.json(
              { error: "Request is too large." },
              { status: 413 },
            );
          }
          chunks.push(next.value);
        }
        body = Buffer.concat(chunks).toString("utf8");
      } catch {
        return NextResponse.json(
          { error: "Unable to read request body." },
          { status: 400 },
        );
      }
    }
    if (Buffer.byteLength(body, "utf8") > 16000)
      return NextResponse.json(
        { error: "Request is too large." },
        { status: 413 },
      );
    try {
      const value = JSON.parse(body);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error();
    } catch {
      return NextResponse.json(
        { error: "A JSON object is required." },
        { status: 400 },
      );
    }
  }
  try {
    const key = await secret();
    const jar = await cookies();
    const { user } = await getAuthContext();
    const old = jar.get(COOKIE)?.value;
    const anonymous = old && UUID.test(old) ? old : randomUUID();
    const owner = createHmac("sha256", key)
      .update(user ? `user:${user.id}` : `anonymous:${anonymous}`)
      .digest("hex");
    const stamp = String(Math.floor(Date.now() / 1000));
    const upstreamPath = "/planning/" + parts.join("/");
    const digest = createHash("sha256").update(body).digest("hex");
    const signature = createHmac("sha256", key)
      .update([stamp, owner, request.method, upstreamPath, digest].join("\n"))
      .digest("hex");
    const response = await fetch(
      (process.env.MULTIAGENT_API_URL || "http://127.0.0.1:8000").replace(
        /\/$/,
        "",
      ) + upstreamPath,
      {
        method: request.method,
        headers: {
          "Content-Type": "application/json",
          "X-Plan-Owner": owner,
          "X-Plan-Time": stamp,
          "X-Plan-Signature": signature,
        },
        ...(body ? { body } : {}),
        signal: AbortSignal.timeout(25000),
        cache: "no-store",
      },
    );
    const data = await response.json();
    const out = NextResponse.json(
      response.ok
        ? data
        : {
            error:
              typeof data.detail === "string"
                ? data.detail
                : JSON.stringify(data.detail || "Planning request failed."),
          },
      { status: response.status },
    );
    if (!user)
      out.cookies.set(COOKIE, anonymous, {
        httpOnly: true,
        sameSite: "lax",
        secure:
          new URL(request.url).protocol === "https:" ||
          request.headers.get("x-forwarded-proto") === "https",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    out.headers.set("Cache-Control", "private, no-store");
    return out;
  } catch (e) {
    const timeout =
      e instanceof Error && ["TimeoutError", "AbortError"].includes(e.name);
    return NextResponse.json(
      {
        error: timeout
          ? "The planning service did not respond in time. Your existing job is preserved; retry loading it."
          : "Planning service unavailable. Check backend and planning proxy configuration.",
      },
      { status: timeout ? 504 : 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
