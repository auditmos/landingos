CREATE TYPE "public"."safety_report_reason" AS ENUM('harassment_or_discrimination', 'threats_or_impersonation', 'money_or_private_information', 'personal_data', 'illegal_content', 'commercial_spam', 'other');--> statement-breakpoint
CREATE TYPE "public"."safety_report_status" AS ENUM('open');--> statement-breakpoint
CREATE TABLE "community_rules_acceptances" (
	"user_id" text NOT NULL,
	"rules_version" text NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "community_rules_acceptances_user_id_rules_version_pk" PRIMARY KEY("user_id","rules_version")
);
--> statement-breakpoint
CREATE TABLE "safety_reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"reporter_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"message_id" uuid,
	"reason" "safety_report_reason" NOT NULL,
	"note" text,
	"status" "safety_report_status" DEFAULT 'open' NOT NULL,
	"evidence_snapshot" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"blocked_at" timestamp with time zone NOT NULL,
	"hidden_through" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
ALTER TABLE "community_rules_acceptances" ADD CONSTRAINT "community_rules_acceptances_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_room_id_flight_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."flight_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_reporter_id_auth_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_target_user_id_auth_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_message_id_room_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."room_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_auth_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_auth_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "safety_reports_member_retry_unique" ON "safety_reports" USING btree ("reporter_id","target_user_id") WHERE "safety_reports"."message_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "safety_reports_message_retry_unique" ON "safety_reports" USING btree ("reporter_id","target_user_id","message_id") WHERE "safety_reports"."message_id" is not null;--> statement-breakpoint
CREATE INDEX "safety_reports_room_status_idx" ON "safety_reports" USING btree ("room_id","status");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_active_idx" ON "user_blocks" USING btree ("blocked_id","active");