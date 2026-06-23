import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  pgEnum,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { NotificationPhone } from "@/lib/notification-phones";

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
  "void",
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
    notificationPhones: jsonb("notification_phones")
      .$type<NotificationPhone[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    leadSnapWebhook: text("lead_snap_webhook"),
    areaCode: text("area_code"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("companies_billing_status_idx").on(table.billingStatus),
    index("companies_current_balance_idx").on(table.currentBalanceCents),
  ]
);

export const companiesRelations = relations(companies, ({ one, many }) => ({
  retellNumbers: many(retellNumbers),
  users: many(users),
  // ADR-012: a Company has exactly one Text agent (1:1) and many Chat
  // conversations. Forward refs — tables declared lower in this file.
  textAgent: one(textAgents),
  chatConversations: many(chatConversations),
}));

// ─── Retell Numbers ──────────────────────────────────────────
// ADR-010: a Retell number is a number↔agent pair (1:1), many per
// company. Replaces the legacy company↔agent mapping and the single
// company-level phone column (both dropped in phase 3 of PRD #41).

export const retellNumbers = pgTable(
  "retell_numbers",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
    // E.164 US (e.g. +17163210677). Null for legacy rows pending manual fixup.
    phoneNumber: text("phone_number"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("retell_numbers_agent_id_idx").on(table.agentId),
    uniqueIndex("retell_numbers_phone_number_idx").on(table.phoneNumber),
  ]
);

export const retellNumbersRelations = relations(retellNumbers, ({ one }) => ({
  company: one(companies, {
    fields: [retellNumbers.companyId],
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

export type TranscriptTurn = {
  role: "agent" | "user";
  content: string;
};


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
    // ADR-006: all fields below arrive in a single call_ended webhook.
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    customerAddress: text("customer_address"),
    customerZipcode: text("customer_zipcode"),
    customerCity: text("customer_city"),
    service: text("service"),
    summary: text("summary"),
    callDate: text("call_date"),
    // Call metadata
    event: text("event"),
    retellEvent: text("retell_event"),
    callStatus: text("call_status"),
    disconnectionReason: text("disconnection_reason"),
    startTimestamp: bigint("start_timestamp", { mode: "number" }),
    endTimestamp: bigint("end_timestamp", { mode: "number" }),
    durationMs: integer("duration_ms"),
    audioUrl: text("audio_url"),
    // USD dollars decimal. Visible only to root/admin (ADR-003).
    retellCost: numeric("retell_cost", { precision: 10, scale: 6 }),
    // ADR-004: filtered transcript [{role, content}] from n8n.
    transcript: jsonb("transcript").$type<TranscriptTurn[]>(),
    // Billing
    billingPriceCents: integer("billing_price_cents"),
    billingCountedAt: timestamp("billing_counted_at"),
    invoiceId: text("invoice_id").references((): AnyPgColumn => invoices.id, {
      onDelete: "set null",
    }),
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
    voidedAt: timestamp("voided_at"),
    voidedBy: text("voided_by").references(() => users.id, {
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
  billingThresholdCalls: integer("billing_threshold_calls")
    .notNull()
    .default(25),
  // ADR-007: Calls shorter than this (in seconds) are auto-voided at
  // ingestion. 0 disables the rule. Compared strictly against
  // calls.duration_ms (duration_ms < seconds * 1000).
  minBillableDurationSeconds: integer("min_billable_duration_seconds")
    .notNull()
    .default(20),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => users.id),
});

// ─── Stripe Webhook Events (dedup) ───────────────────────────

export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at").defaultNow().notNull(),
});

// ─── Text Agent + Chat (PRD "agents fase 1") ─────────────────
// ADR-011: server owns the conversation id; the LLM context is rebuilt from
// the DB. ADR-012: per-Company Text agent supersedes the global env prompt.
// ADR-013: lead extraction lives in n8n, not here.

export const chatConversationSourceEnum = pgEnum("chat_conversation_source", [
  "widget",
  "playground",
]);

export const chatStatusEnum = pgEnum("chat_status", ["pending", "sent"]);

export const chatMessageRoleEnum = pgEnum("chat_message_role", [
  "user",
  "assistant",
]);

// A field the Text agent must capture from a Chat conversation (the Catalog).
// Double role: injected into the system prompt AND shipped to n8n.
export type CatalogField = {
  name: string;
  description: string;
};

// ADR-012: a Company's 1:1 Text agent config. PK = company_id enforces the
// one-per-company relation. `system_prompt` is plain (not versioned); an empty
// value falls back to DEFAULT_SYSTEM_PROMPT in code. `model` is constrained to
// a curated allowlist at the app layer (cost is absorbed by the agency).
export const textAgents = pgTable("text_agents", {
  companyId: text("company_id")
    .primaryKey()
    .references(() => companies.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  // Default mirrors DEFAULT_MODEL in lib/ai/models.ts; the app sets it
  // explicitly on every write, this is only the DB-level fallback.
  model: text("model").notNull().default("anthropic/claude-haiku-4.5"),
  systemPrompt: text("system_prompt").notNull().default(""),
  catalog: jsonb("catalog")
    .$type<CatalogField[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const textAgentsRelations = relations(textAgents, ({ one }) => ({
  company: one(companies, {
    fields: [textAgents.companyId],
    references: [companies.id],
  }),
}));

export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    source: chatConversationSourceEnum("source").notNull().default("widget"),
    status: chatStatusEnum("status").notNull().default("pending"),
    // Denormalized timestamp of the last Chat message. n8n reads it to decide
    // when the chat cooled off enough to send the Lead. Null until first msg.
    lastInteractionAt: timestamp("last_interaction_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // GET /chats/pending: status=pending AND source=widget, ordered by
    // last_interaction_at asc.
    index("chat_conversations_status_source_last_idx").on(
      t.status,
      t.source,
      t.lastInteractionAt
    ),
    // Master list of a company's chats, newest first.
    index("chat_conversations_company_created_idx").on(
      t.companyId,
      t.createdAt
    ),
  ]
);

export const chatConversationsRelations = relations(
  chatConversations,
  ({ one, many }) => ({
    company: one(companies, {
      fields: [chatConversations.companyId],
      references: [companies.id],
    }),
    messages: many(chatMessages),
  })
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    role: chatMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    // Usage/cost — assistant turns only (null on user turns). Cost is integer
    // micro-USD for sub-cent precision. Visible only to agency users (ADR-003).
    model: text("model"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    costMicroUsd: integer("cost_micro_usd"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // Rebuild a conversation chronologically; tie-break by id for stability.
    index("chat_messages_conversation_created_idx").on(
      t.conversationId,
      t.createdAt
    ),
  ]
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}));
