CREATE TABLE "partner_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"partner_code" varchar(50) NOT NULL,
	"partner_name" varchar(255) NOT NULL,
	"api_key_hash" varchar(64) NOT NULL,
	"api_key_prefix" varchar(16) NOT NULL,
	"encrypted_secret" text NOT NULL,
	"ip_whitelist" text[] DEFAULT '{}' NOT NULL,
	"allowed_routes" text[] DEFAULT '{}' NOT NULL,
	"rate_limit_rpm" integer DEFAULT 60 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(150) NOT NULL,
	"updated_by" varchar(150) NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "partner_credentials_partner_code_uq" ON "partner_credentials" USING btree ("partner_code");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_credentials_api_key_hash_uq" ON "partner_credentials" USING btree ("api_key_hash") WHERE "deleted_at" is null;