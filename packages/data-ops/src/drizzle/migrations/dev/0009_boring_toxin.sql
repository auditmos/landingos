ALTER TABLE "room_messages" DROP CONSTRAINT "room_messages_membership_id_room_memberships_id_fk";
--> statement-breakpoint
ALTER TABLE "safety_reports" DROP CONSTRAINT "safety_reports_reporter_id_auth_user_id_fk";
--> statement-breakpoint
ALTER TABLE "safety_reports" DROP CONSTRAINT "safety_reports_target_user_id_auth_user_id_fk";
--> statement-breakpoint
ALTER TABLE "room_messages" ALTER COLUMN "membership_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "room_messages" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "safety_reports" ALTER COLUMN "reporter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "safety_reports" ALTER COLUMN "target_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "flight_rooms" ADD COLUMN "closes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "flight_rooms" ADD COLUMN "message_purge_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "room_messages" ADD COLUMN "author_pseudonym" text;--> statement-breakpoint
ALTER TABLE "room_messages" ADD COLUMN "tombstoned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "room_messages" ADD COLUMN "content_purged_at" timestamp with time zone;--> statement-breakpoint
UPDATE "flight_rooms"
SET
	"closes_at" = "flight_instances"."scheduled_arrival_utc" + interval '24 hours',
	"message_purge_at" = "flight_instances"."scheduled_arrival_utc" + interval '31 days'
FROM "flight_instances"
WHERE "flight_rooms"."flight_instance_id" = "flight_instances"."id";--> statement-breakpoint
UPDATE "room_messages"
SET "author_pseudonym" = COALESCE("auth_user"."pseudonym", 'Usunięty podróżny')
FROM "room_memberships", "auth_user"
WHERE
	"room_messages"."membership_id" = "room_memberships"."id"
	AND "room_memberships"."user_id" = "auth_user"."id";--> statement-breakpoint
ALTER TABLE "flight_rooms" ALTER COLUMN "closes_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "flight_rooms" ALTER COLUMN "message_purge_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "room_messages" ALTER COLUMN "author_pseudonym" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_membership_id_room_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."room_memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_reporter_id_auth_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_target_user_id_auth_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flight_rooms_closes_at_idx" ON "flight_rooms" USING btree ("closes_at");--> statement-breakpoint
CREATE INDEX "flight_rooms_message_purge_at_idx" ON "flight_rooms" USING btree ("message_purge_at");
