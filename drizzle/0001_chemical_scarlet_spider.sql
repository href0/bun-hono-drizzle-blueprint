CREATE TABLE "record_changes" (
	"id" bigint GENERATED ALWAYS AS IDENTITY (sequence name "record_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text NOT NULL,
	"action" text NOT NULL,
	"changes" jsonb NOT NULL,
	"actor" text NOT NULL,
	"request_id" text,
	CONSTRAINT "record_changes_id_changed_at_pk" PRIMARY KEY("id","changed_at"),
	CONSTRAINT "record_changes_action_check" CHECK ("action" in ('UPDATE', 'SOFT_DELETE', 'RESTORE', 'DELETE'))
);
--> statement-breakpoint
CREATE INDEX "record_changes_lookup_idx" ON "record_changes" USING btree ("table_name","record_id","changed_at" DESC NULLS LAST);