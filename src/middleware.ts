import { NextRequest, NextResponse } from "next/server";

/** events.capitalwealth.com → serve the /events check-in flow at the root. */
export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const { pathname } = req.nextUrl;
  if (host.startsWith("events.") && (pathname === "/" || pathname === "")) {
    const url = req.nextUrl.clone();
    url.pathname = "/events";
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
