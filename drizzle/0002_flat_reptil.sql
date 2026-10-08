ALTER TABLE "record_changes" ADD COLUMN "parent_table" text;--> statement-breakpoint
ALTER TABLE "record_changes" ADD COLUMN "parent_id" text;--> statement-breakpoint
CREATE INDEX "record_changes_parent_idx" ON "record_changes" USING btree ("parent_table","parent_id","changed_at" DESC NULLS LAST) WHERE "parent_id" is not null;--> statement-breakpoint
ALTER TABLE "record_changes" ADD CONSTRAINT "record_changes_parent_check" CHECK (("parent_table" is null) = ("parent_id" is null));