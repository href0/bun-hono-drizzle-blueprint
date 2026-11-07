CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(150) NOT NULL,
	"updated_by" varchar(150) NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"label" varchar(150) NOT NULL,
	"group_name" varchar(100) NOT NULL,
	"source" varchar(10) NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(150) NOT NULL,
	"updated_by" varchar(150) NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "permissions_source_check" CHECK ("source" in ('api', 'menu')),
	CONSTRAINT "permissions_menu_prefix_check" CHECK (("source" = 'menu') = ("key" like 'menu.%'))
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(150) NOT NULL,
	"updated_by" varchar(150) NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(150) NOT NULL,
	"updated_by" varchar(150) NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"expires_at" timestamp with time zone,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(150) NOT NULL,
	"updated_by" varchar(150) NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_key_active_uq" ON "roles" USING btree ("key") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_key_active_uq" ON "permissions" USING btree ("key") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_role_permission_active_uq" ON "role_permissions" USING btree ("role_id","permission_id") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_role_active_uq" ON "user_roles" USING btree ("user_id","role_id") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_permissions_user_permission_active_uq" ON "user_permissions" USING btree ("user_id","permission_id") WHERE "deleted_at" is null;--> statement-breakpoint
CREATE INDEX "user_permissions_permission_idx" ON "user_permissions" USING btree ("permission_id");--> statement-breakpoint
-- Data (hand-written, D58/D59): the system roles, one role per other users.role value (projects may
-- have added roles to ROLES) and every user's current role as a user_roles row. Ids are UUID v7 like
-- the application's (PostgreSQL 16 has no uuidv7()): 48-bit millisecond time + random bits, version
-- and variant bits set. Actor: system.
INSERT INTO "roles" ("id", "key", "name", "description", "is_system", "created_by", "updated_by") VALUES
	(encode(set_bit(set_bit(set_bit(set_bit(set_bit(set_bit(overlay(decode(md5(random()::text || clock_timestamp()::text || 'super_admin'), 'hex') placing substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3) from 1 for 6), 52, 1), 53, 1), 54, 1), 55, 0), 70, 0), 71, 1), 'hex')::uuid, 'super_admin', 'Super Admin', 'Every permission; cannot be changed or deleted', true, 'system', 'system'),
	(encode(set_bit(set_bit(set_bit(set_bit(set_bit(set_bit(overlay(decode(md5(random()::text || clock_timestamp()::text || 'user'), 'hex') placing substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3) from 1 for 6), 52, 1), 53, 1), 54, 1), 55, 0), 70, 0), 71, 1), 'hex')::uuid, 'user', 'User', 'Given to every new user; only routes open to any signed-in user until permissions are mapped', true, 'system', 'system');--> statement-breakpoint
INSERT INTO "roles" ("id", "key", "name", "is_system", "created_by", "updated_by")
SELECT encode(set_bit(set_bit(set_bit(set_bit(set_bit(set_bit(overlay(decode(md5(random()::text || clock_timestamp()::text || "role"), 'hex') placing substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3) from 1 for 6), 52, 1), 53, 1), 54, 1), 55, 0), 70, 0), 71, 1), 'hex')::uuid, "role", initcap(replace("role", '_', ' ')), false, 'system', 'system'
FROM (SELECT DISTINCT "role" FROM "users" WHERE "role" NOT IN ('admin', 'user')) AS "custom_roles";--> statement-breakpoint
INSERT INTO "user_roles" ("id", "user_id", "role_id", "created_by", "updated_by")
SELECT encode(set_bit(set_bit(set_bit(set_bit(set_bit(set_bit(overlay(decode(md5(random()::text || clock_timestamp()::text || "users"."id"::text), 'hex') placing substring(int8send((extract(epoch from clock_timestamp()) * 1000)::bigint) from 3) from 1 for 6), 52, 1), 53, 1), 54, 1), 55, 0), 70, 0), 71, 1), 'hex')::uuid, "users"."id", "roles"."id", 'system', 'system'
FROM "users"
JOIN "roles" ON "roles"."deleted_at" IS NULL
	AND "roles"."key" = CASE "users"."role" WHEN 'admin' THEN 'super_admin' ELSE "users"."role" END;
