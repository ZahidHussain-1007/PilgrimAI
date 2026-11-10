import { NextRequest, NextResponse } from "next/server";

/** Establish the anonymous planning identity on the HTML navigation response,
 * before any client effects can issue concurrent list/create requests. Otherwise
 * two cookieless first API calls can mint different owners and a late Set-Cookie
 * can hide the newly saved job. The signed gateway remains the authority. */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const existing = request.cookies.get("pilgrim_planning_owner")?.value;
  if (
    !existing ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      existing,
    )
  )
    response.cookies.set("pilgrim_planning_owner", crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure:
        request.nextUrl.protocol === "https:" ||
        request.headers.get("x-forwarded-proto") === "https",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  return response;
}
export const config = {
  matcher: ["/plan", "/planning/:path*", "/itinerary/:path*"],
};
