import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { users, businessConfig } from "./schema";
import bcryptjs from "bcryptjs";

async function seed() {
  const db = drizzle(process.env.DATABASE_URL!);

  const hashedPassword = await bcryptjs.hash("admin123", 10);

  await db.insert(users).values({
    email: "root@callsystem.com",
    password: hashedPassword,
    role: "root",
    companyId: null,
    isActive: true,
  });

  await db.insert(businessConfig).values({
    pricePerCallCents: 100,
    billingThresholdCents: 5000,
  });

  console.log("Seed completed: root user + business config created");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
