import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authMode, verifySessionValue } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const mode = authMode();
  if (mode === "open-demo") return NextResponse.next();
  const ok = mode === "password" && (await verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value));
  if (ok) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Todo excepto login, cron (usa CRON_SECRET) y estáticos
  matcher: ["/((?!login|api/cron|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
