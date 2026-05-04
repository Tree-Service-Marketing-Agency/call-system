import { eq } from "drizzle-orm";
import bcryptjs from "bcryptjs";
import { db } from "@/lib/db";
import { companies, users } from "@/lib/db/schema";

export class EmailAlreadyExistsError extends Error {
  constructor(public readonly email: string) {
    super(`Email already exists: ${email}`);
    this.name = "EmailAlreadyExistsError";
  }
}

export interface OnboardCompanyInput {
  name: string;
  notificationPhones: string[];
  leadSnapWebhook: string | null;
  userEmail: string;
  userPassword: string;
}

export interface OnboardCompanyResult {
  company: { id: string; name: string };
  user: { id: string; email: string };
}

export async function onboardCompany(
  input: OnboardCompanyInput
): Promise<OnboardCompanyResult> {
  const hashedPassword = await bcryptjs.hash(input.userPassword, 10);

  return await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.userEmail))
      .limit(1);

    if (existing.length > 0) {
      throw new EmailAlreadyExistsError(input.userEmail);
    }

    const [company] = await tx
      .insert(companies)
      .values({
        name: input.name,
        notificationPhones: input.notificationPhones,
        leadSnapWebhook: input.leadSnapWebhook,
      })
      .returning({ id: companies.id, name: companies.name });

    const [user] = await tx
      .insert(users)
      .values({
        email: input.userEmail,
        password: hashedPassword,
        role: "staff_admin",
        companyId: company.id,
        isActive: true,
      })
      .returning({ id: users.id, email: users.email });

    return { company, user };
  });
}
