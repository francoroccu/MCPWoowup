import {
  pgTable,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  serial,
  primaryKey,
} from "drizzle-orm/pg-core";

/** Cuenta madre (ej: Comercial Depor). Agrupa varias cuentas WoowUp (marcas). */
export const accountGroups = pgTable("account_groups", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Cuenta WoowUp = una marca. El slug es el mismo que devuelve list_accounts. */
export const accounts = pgTable("accounts", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  groupSlug: text("group_slug").references(() => accountGroups.slug, { onDelete: "set null" }),
  country: text("country"),
  currency: text("currency"),
  timezone: text("timezone"),
  status: text("status"),
  role: text("role"),
  channels: jsonb("channels").$type<string[]>().default([]).notNull(),
  hidden: boolean("hidden").default(false).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Una fila por cuenta × mes × canal × tipo de campaña.
 * channel: all | email | sms | whatsapp | push
 * group_type: all | custom (one-shot) | triggered (automatizaciones)
 */
export const monthlyMetrics = pgTable(
  "monthly_metrics",
  {
    accountSlug: text("account_slug")
      .notNull()
      .references(() => accounts.slug, { onDelete: "cascade" }),
    month: text("month").notNull(), // YYYY-MM
    channel: text("channel").notNull(),
    groupType: text("group_type").notNull(),
    sent: integer("sent").default(0).notNull(),
    delivered: integer("delivered").default(0).notNull(),
    bounces: integer("bounces").default(0).notNull(),
    opens: integer("opens").default(0).notNull(),
    clicks: integer("clicks").default(0).notNull(),
    spam: integer("spam").default(0).notNull(),
    unsubscribes: integer("unsubscribes").default(0).notNull(),
    conversions: integer("conversions").default(0).notNull(),
    revenue: doublePrecision("revenue"),
    revenueRedacted: boolean("revenue_redacted").default(false).notNull(),
    campaigns: integer("campaigns").default(0).notNull(),
    raw: jsonb("raw"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountSlug, t.month, t.channel, t.groupType] })],
);

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  trigger: text("trigger").notNull(), // cron | manual | cli
  months: jsonb("months").$type<string[]>().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(), // running | ok | partial | error
  accountsOk: integer("accounts_ok").default(0).notNull(),
  accountsFailed: integer("accounts_failed").default(0).notNull(),
  errors: jsonb("errors").$type<{ account: string; message: string }[]>().default([]).notNull(),
});

/**
 * Métricas por campaña y mes (list_campaigns con with_stats, filter_by=activity).
 * Las automatizaciones aparecen todos los meses con el mismo campaign_id → historial.
 */
export const campaignMetrics = pgTable(
  "campaign_metrics",
  {
    accountSlug: text("account_slug")
      .notNull()
      .references(() => accounts.slug, { onDelete: "cascade" }),
    month: text("month").notNull(), // YYYY-MM
    campaignId: text("campaign_id").notNull(),
    name: text("name").notNull(),
    channel: text("channel").notNull(), // email | sms | whatsapp | push
    groupType: text("group_type").notNull(), // custom | triggered
    campaignType: text("campaign_type"), // newsletter, abandoned_cart, ...
    status: text("status"),
    sentAt: text("sent_at"), // YYYY-MM-DD (one-shot)
    subject: text("subject"),
    sent: integer("sent").default(0).notNull(),
    delivered: integer("delivered").default(0).notNull(),
    bounces: integer("bounces").default(0).notNull(),
    opens: integer("opens").default(0).notNull(),
    clicks: integer("clicks").default(0).notNull(),
    spam: integer("spam").default(0).notNull(),
    unsubscribes: integer("unsubscribes").default(0).notNull(),
    conversions: integer("conversions").default(0).notNull(),
    revenue: doublePrecision("revenue"),
    revenueRedacted: boolean("revenue_redacted").default(false).notNull(),
    raw: jsonb("raw"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountSlug, t.month, t.campaignId] })],
);
