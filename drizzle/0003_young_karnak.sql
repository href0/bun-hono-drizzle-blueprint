ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "created_by" varchar(150) NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_by" varchar(150) NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_active_uq" ON "users" USING btree ("email") WHERE "deleted_at" is null;