import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllowedOriginsByEmbedKey } from "@/lib/text-agent/repository";

export const proxy = auth(async (req) => {
  const { pathname } = req.nextUrl;

  // ADR-014: the embeddable widget PAGE. Set a per-company frame-ancestors CSP
  // so the iframe only loads inside the company's allowed origins (+ 'self').
  // Node runtime (proxy default) lets us hit the DB directly. NEVER set
  // X-Frame-Options (it would break the cross-origin embed), and only set the
  // frame-ancestors directive (a full CSP would break the page's own scripts).
  if (pathname === "/widget") {
    const key = req.nextUrl.searchParams.get("key");
    let frameAncestors = "'self'";
    if (key) {
      try {
        const origins = await getAllowedOriginsByEmbedKey(key);
        if (origins && origins.length) {
          frameAncestors = ["'self'", ...origins].join(" ");
        }
      } catch {
        // Fail to 'self' — secure default, never crash the proxy.
      }
    }
    const res = NextResponse.next();
    res.headers.set("Content-Security-Policy", `frame-ancestors ${frameAncestors}`);
    return res;
  }

  // Public routes — skip auth check. `/widget` also covers the static loader
  // `/widget.v1.js`; `/api/chat` is the public widget chat flow (ADR-014).
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/audio-call") ||
    pathname.startsWith("/widget") ||
    pathname.startsWith("/api/chat") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/external")
  ) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!req.auth?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const role = req.auth.user.role;

  // Route-level access control
  if (pathname.startsWith("/business-model") && role !== "root") {
    return NextResponse.redirect(new URL("/calls", req.url));
  }

  if (
    pathname.startsWith("/companies") &&
    role !== "root" &&
    role !== "admin"
  ) {
    return NextResponse.redirect(new URL("/calls", req.url));
  }

  if (
    pathname.startsWith("/billing") &&
    role !== "root" &&
    role !== "admin" &&
    role !== "staff_admin"
  ) {
    return NextResponse.redirect(new URL("/calls", req.url));
  }

  if (pathname.startsWith("/users") && role === "staff") {
    return NextResponse.redirect(new URL("/calls", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
