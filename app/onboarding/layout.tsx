import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { auth } from "@/lib/auth";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role;
  if (role !== "root" && role !== "admin") {
    redirect("/");
  }

  const userEmail = (session.user as { email?: string | null }).email ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-12 items-center justify-between border-b border-border bg-sidebar px-6">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Link
            href="/"
            className="flex items-center gap-1.5 font-medium text-foreground"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="size-4" />
            Lola
          </Link>
          <ChevronRightIcon className="size-3.5 text-muted-foreground/60" />
          <Link href="/companies" className="hover:text-foreground">
            Companies
          </Link>
          <ChevronRightIcon className="size-3.5 text-muted-foreground/60" />
          <span className="text-foreground">New company</span>
        </nav>
        {userEmail && (
          <span className="text-xs font-medium text-muted-foreground">
            {userEmail}
          </span>
        )}
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
