import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0] ?? "";
  if (["s-noticing.vercel.app", "m-arc.vercel.app"].includes(host) && request.nextUrl.pathname === "/") {
    return NextResponse.rewrite(new URL("/gallery", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
