import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl;

  // Public routes — skip auth check
  if (
    pathname.startsWith("/login") ||
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
