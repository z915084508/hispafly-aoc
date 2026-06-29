import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = `/staff${url.pathname}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/pilots/:path*", "/pireps/:path*", "/payroll/:path*", "/wallet/:path*", "/audit/:path*", "/settings/:path*"] };
