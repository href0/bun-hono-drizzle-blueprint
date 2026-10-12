CREATE TABLE "auth_refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"family_started_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_id" uuid,
	"user_agent" varchar(255),
	"ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_refresh_tokens_hash_uq" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" varchar(20) DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_refresh_tokens" ADD CONSTRAINT "auth_refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_refresh_tokens_user_idx" ON "auth_refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_refresh_tokens_family_idx" ON "auth_refresh_tokens" USING btree ("family_id");