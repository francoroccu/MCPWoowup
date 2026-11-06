CREATE TABLE "account_groups" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"group_slug" text,
	"country" text,
	"currency" text,
	"timezone" text,
	"status" text,
	"role" text,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_items" (
	"scope_key" text NOT NULL,
	"insight_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_items_scope_key_insight_id_pk" PRIMARY KEY("scope_key","insight_id")
);
--> statement-breakpoint
CREATE TABLE "campaign_metrics" (
	"account_slug" text NOT NULL,
	"month" text NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"channel" text NOT NULL,
	"group_type" text NOT NULL,
	"campaign_type" text,
	"status" text,
	"sent_at" text,
	"subject" text,
	"sent" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"bounces" integer DEFAULT 0 NOT NULL,
	"opens" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"spam" integer DEFAULT 0 NOT NULL,
	"unsubscribes" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"revenue" double precision,
	"revenue_redacted" boolean DEFAULT false NOT NULL,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_metrics_account_slug_month_campaign_id_pk" PRIMARY KEY("account_slug","month","campaign_id")
);
--> statement-breakpoint
CREATE TABLE "monthly_metrics" (
	"account_slug" text NOT NULL,
	"month" text NOT NULL,
	"channel" text NOT NULL,
	"group_type" text NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"bounces" integer DEFAULT 0 NOT NULL,
	"opens" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"spam" integer DEFAULT 0 NOT NULL,
	"unsubscribes" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"revenue" double precision,
	"revenue_redacted" boolean DEFAULT false NOT NULL,
	"campaigns" integer DEFAULT 0 NOT NULL,
	"raw" jsonb,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_metrics_account_slug_month_channel_group_type_pk" PRIMARY KEY("account_slug","month","channel","group_type")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"months" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"accounts_ok" integer DEFAULT 0 NOT NULL,
	"accounts_failed" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_group_slug_account_groups_slug_fk" FOREIGN KEY ("group_slug") REFERENCES "public"."account_groups"("slug") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_metrics" ADD CONSTRAINT "campaign_metrics_account_slug_accounts_slug_fk" FOREIGN KEY ("account_slug") REFERENCES "public"."accounts"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_metrics" ADD CONSTRAINT "monthly_metrics_account_slug_accounts_slug_fk" FOREIGN KEY ("account_slug") REFERENCES "public"."accounts"("slug") ON DELETE cascade ON UPDATE no action;