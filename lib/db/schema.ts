import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  index,
  uniqueIndex,
  pgEnum,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ───────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "root",
  "admin",
  "staff_admin",
  "staff",
]);

export const billingStatusEnum = pgEnum("billing_status", [
  "idle",
  "charging",
  "payment_pending",
  "uncollectible",
]);

export const ledgerEntryTypeEnum = pgEnum("ledger_entry_type", ["call_charge"]);

export const ledgerStatusEnum = pgEnum("ledger_status", [
  "pending",
  "reserved",
  "paid",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "pending",
  "paid",
  "failed",
  "uncollectible",
  "creation_failed",
]);

// ─── Companies ───────────────────────────────────────────────

export const companies = pgTable(
  "companies",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripePaymentMethodId: text("stripe_payment_method_id"),
    billingStatus: billingStatusEnum("billing_status")
      .notNull()
      .default("idle"),
    currentBalanceCents: integer("current_balance_cents").notNull().default(0),
    billingUpdatedAt: timestamp("billing_updated_at"),
    lastNoPaymentWarningAt: timestamp("last_no_payment_warning_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("companies_billing_status_idx").on(table.billingStatus),
    index("companies_current_balance_idx").on(table.currentBalanceCents),
  ]
);

export const companiesRelations = relations(companies, ({ many }) => ({
  agents: many(companyAgents),
  users: many(users),
}));

// ─── Company Agents ──────────────────────────────────────────

export const companyAgents = pgTable(
  "company_agents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
  },
  (table) => [uniqueIndex("company_agents_agent_id_idx").on(table.agentId)]
);

export const companyAgentsRelations = relations(companyAgents, ({ one }) => ({
  company: one(companies, {
    fields: [companyAgents.companyId],
    references: [companies.id],
  }),
}));

// ─── Users ───────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull(),
  companyId: text("company_id").references(() => companies.id, {
    onDelete: "set null",
  }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one }) => ({
  company: one(companies, {
    fields: [users.companyId],
    references: [companies.id],
  }),
}));

// ─── Invoices ────────────────────────────────────────────────
// Defined before `calls` and `billing_ledger` so they can FK into it.

export const invoices = pgTable(
  "invoices",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    stripeInvoiceId: text("stripe_invoice_id"),
    amountCents: integer("amount_cents").notNull(),
    status: invoiceStatusEnum("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at"),
    hostedInvoiceUrl: text("hosted_invoice_url"),
    entryCount: integer("entry_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    paidAt: timestamp("paid_at"),
    failedAt: timestamp("failed_at"),
  },
  (table) => [
    uniqueIndex("invoices_stripe_invoice_id_idx").on(table.stripeInvoiceId),
    index("invoices_company_status_created_idx").on(
      table.companyId,
      table.status,
      table.createdAt
    ),
  ]
);

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  company: one(companies, {
    fields: [invoices.companyId],
    references: [companies.id],
  }),
  ledgerEntries: many(billingLedger),
  calls: many(calls),
}));

// ─── Calls ───────────────────────────────────────────────────

export const calls = pgTable(
  "calls",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    callId: text("call_id").notNull(),
    agentId: text("agent_id").notNull(),
    companyId: text("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    // Webhook 1 — datos del cliente
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    customerAddress: text("customer_address"),
    customerZipcode: text("customer_zipcode"),
    customerCity: text("customer_city"),
    service: text("service"),
    summary: text("summary"),
    callDate: text("call_date"),
    // Webhook 2 — call metadata
    event: text("event"),
    retellEvent: text("retell_event"),
    callStatus: text("call_status"),
    disconnectionReason: text("disconnection_reason"),
    startTimestamp: bigint("start_timestamp", { mode: "number" }),
    endTimestamp: bigint("end_timestamp", { mode: "number" }),
    durationMs: integer("duration_ms"),
    audioUrl: text("audio_url"),
    retellCost: text("retell_cost"),
    // Billing
    billingPriceCents: integer("billing_price_cents"),
    billingCountedAt: timestamp("billing_counted_at"),
    invoiceId: text("invoice_id").references((): AnyPgColumn => invoices.id, {
      onDelete: "set null",
    }),
    // Flags
    webhook1Received: boolean("webhook1_received").default(false).notNull(),
    webhook2Received: boolean("webhook2_received").default(false).notNull(),
    // Timestamps
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("calls_call_id_agent_id_idx").on(table.callId, table.agentId),
    index("calls_invoice_id_idx").on(table.invoiceId),
  ]
);

export const callsRelations = relations(calls, ({ one }) => ({
  company: one(companies, {
    fields: [calls.companyId],
    references: [companies.id],
  }),
  invoice: one(invoices, {
    fields: [calls.invoiceId],
    references: [invoices.id],
  }),
}));

// ─── Billing Ledger ──────────────────────────────────────────

export const billingLedger = pgTable(
  "billing_ledger",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    callId: text("call_id").notNull(),
    callRowId: text("call_row_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    entryType: ledgerEntryTypeEnum("entry_type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: ledgerStatusEnum("status").notNull().default("pending"),
    invoiceId: text("invoice_id").references((): AnyPgColumn => invoices.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("billing_ledger_call_entry_idx").on(
      table.callId,
      table.entryType
    ),
    index("billing_ledger_company_status_created_idx").on(
      table.companyId,
      table.status,
      table.createdAt
    ),
    index("billing_ledger_invoice_id_idx").on(table.invoiceId),
  ]
);

export const billingLedgerRelations = relations(billingLedger, ({ one }) => ({
  company: one(companies, {
    fields: [billingLedger.companyId],
    references: [companies.id],
  }),
  call: one(calls, {
    fields: [billingLedger.callRowId],
    references: [calls.id],
  }),
  invoice: one(invoices, {
    fields: [billingLedger.invoiceId],
    references: [invoices.id],
  }),
}));

// ─── Business Config ─────────────────────────────────────────

export const businessConfig = pgTable("business_config", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  pricePerCallCents: integer("price_per_call_cents").notNull().default(100),
  billingThresholdCents: integer("billing_threshold_cents")
    .notNull()
    .default(5000),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => users.id),
});

// ─── Stripe Webhook Events (dedup) ───────────────────────────

export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});
