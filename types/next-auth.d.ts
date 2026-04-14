import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "root" | "admin" | "staff_admin" | "staff";
      companyId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: "root" | "admin" | "staff_admin" | "staff";
    companyId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "root" | "admin" | "staff_admin" | "staff";
    companyId: string | null;
  }
}
