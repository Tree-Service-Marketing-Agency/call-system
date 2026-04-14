"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  PhoneIcon,
  UsersIcon,
  BuildingIcon,
  UserIcon,
  DollarSignIcon,
  SettingsIcon,
  LogOutIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { SidebarBilling } from "@/components/sidebar-billing";

type UserRole = "root" | "admin" | "staff_admin" | "staff";

interface AppSidebarProps {
  user: {
    id: string;
    role: UserRole;
    companyId: string | null;
    name?: string | null;
    email?: string | null;
  };
}

const navItems = [
  {
    title: "Calls",
    href: "/calls",
    icon: PhoneIcon,
    roles: ["root", "admin", "staff_admin", "staff"] as UserRole[],
  },
  {
    title: "Customers",
    href: "/customers",
    icon: UsersIcon,
    roles: ["root", "admin", "staff_admin", "staff"] as UserRole[],
  },
  {
    title: "Companies",
    href: "/companies",
    icon: BuildingIcon,
    roles: ["root", "admin"] as UserRole[],
  },
  {
    title: "Users",
    href: "/users",
    icon: UserIcon,
    roles: ["root", "admin", "staff_admin"] as UserRole[],
  },
  {
    title: "Billing",
    href: "/billing",
    icon: DollarSignIcon,
    roles: ["root", "admin", "staff_admin"] as UserRole[],
  },
  {
    title: "Business Model",
    href: "/business-model",
    icon: SettingsIcon,
    roles: ["root"] as UserRole[],
  },
];

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();
  const showBillingInSidebar =
    user.role === "staff" || user.role === "staff_admin";

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <PhoneIcon className="size-5" />
          <span className="text-lg font-semibold">Call System</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems
                .filter((item) => item.roles.includes(user.role))
                .map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={pathname.startsWith(item.href)}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {showBillingInSidebar && user.companyId && (
          <>
            <SidebarBilling companyId={user.companyId} />
            <SidebarSeparator />
          </>
        )}
        <div className="flex flex-col gap-2 px-2 py-1">
          <p className="text-sm text-muted-foreground truncate">
            {user.email}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOutIcon data-icon="inline-start" />
            Sign out
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
