CREATE TYPE "public"."safety_report_reason" AS ENUM('harassment_or_discrimination', 'threats_or_impersonation', 'money_or_private_information', 'personal_data', 'illegal_content', 'commercial_spam', 'other');--> statement-breakpoint
CREATE TYPE "public"."safety_report_status" AS ENUM('open');--> statement-breakpoint
CREATE TYPE "public"."analytics_event_name" AS ENUM('funnel_started', 'flight_recognized', 'recommendations_viewed', 'transport_selected', 'room_joined', 'chat_activated', 'funnel_abandoned');--> statement-breakpoint
CREATE TYPE "public"."analytics_funnel_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."analytics_funnel_step" AS ENUM('funnel_started', 'flight_recognized', 'recommendations_viewed', 'transport_selected', 'room_joined', 'chat_activated');--> statement-breakpoint
CREATE TYPE "public"."analytics_room_occupancy_bucket" AS ENUM('one', 'two_to_five', 'six_plus');--> statement-breakpoint
CREATE TYPE "public"."analytics_transport_kind" AS ENUM('public_transport', 'shared_taxi');--> statement-breakpoint
CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"pseudonym" text,
	"marketing_consent_granted" boolean DEFAULT false NOT NULL,
	"marketing_consent_policy_version" text,
	"marketing_consent_updated_at" timestamp,
	"role" text DEFAULT 'user' NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"surname" text NOT NULL,
	"email" text NOT NULL,
	CONSTRAINT "clients_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "flight_instances" (
	"id" text PRIMARY KEY NOT NULL,
	"canonical_key" text NOT NULL,
	"marketing_carrier_code" text NOT NULL,
	"marketing_carrier_name" text NOT NULL,
	"marketing_flight_number" text NOT NULL,
	"operating_carrier_code" text,
	"operating_flight_number" text,
	"departure_local_date" date NOT NULL,
	"origin_iata" text NOT NULL,
	"destination_iata" text NOT NULL,
	"scheduled_arrival_utc" timestamp with time zone NOT NULL,
	"display_timezone" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flight_instances_canonical_key_unique" UNIQUE("canonical_key")
);
--> statement-breakpoint
CREATE TABLE "transfer_catalog_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"operator_name" text,
	"service_name" text,
	"origin_iata" text DEFAULT 'BGY' NOT NULL,
	"destination_stop_code" text,
	"destination_stop_name" text,
	"duration_minutes" integer,
	"transfer_count" integer,
	"walking_minutes" integer,
	"walking_meters" integer,
	"source_url" text,
	"checked_at" timestamp with time zone,
	"cost_minor_min" integer,
	"cost_minor_max" integer,
	"purchase_url" text,
	"publication_status" text DEFAULT 'draft' NOT NULL,
	"provenance" text DEFAULT 'operator_verified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"flight_instance_id" text NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"message_purge_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flight_rooms_flight_instance_id_unique" UNIQUE("flight_instance_id")
);
--> statement-breakpoint
CREATE TABLE "room_connection_tickets" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"sequence" bigserial NOT NULL,
	"room_id" uuid NOT NULL,
	"membership_id" uuid,
	"client_message_id" uuid NOT NULL,
	"author_pseudonym" text NOT NULL,
	"content" text,
	"tombstoned_at" timestamp with time zone,
	"content_purged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_selections" (
	"membership_id" uuid PRIMARY KEY NOT NULL,
	"selection" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"reporter_id" text,
	"target_user_id" text,
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
CREATE TABLE "analytics_events" (
	"event_name" "analytics_event_name" NOT NULL,
	"event_time" timestamp with time zone NOT NULL,
	"funnel_id" text NOT NULL,
	"actor_pseudonym" text,
	"last_completed_step" "analytics_funnel_step" NOT NULL,
	"transport_kind" "analytics_transport_kind",
	"room_occupancy_bucket" "analytics_room_occupancy_bucket",
	"schema_version" text NOT NULL,
	CONSTRAINT "analytics_events_funnel_id_event_name_pk" PRIMARY KEY("funnel_id","event_name")
);
--> statement-breakpoint
CREATE TABLE "analytics_funnels" (
	"id" text PRIMARY KEY NOT NULL,
	"status" "analytics_funnel_status" DEFAULT 'active' NOT NULL,
	"last_completed_step" "analytics_funnel_step" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_activity_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_rooms" ADD CONSTRAINT "flight_rooms_flight_instance_id_flight_instances_id_fk" FOREIGN KEY ("flight_instance_id") REFERENCES "public"."flight_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_connection_tickets" ADD CONSTRAINT "room_connection_tickets_room_id_flight_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."flight_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_connection_tickets" ADD CONSTRAINT "room_connection_tickets_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_memberships" ADD CONSTRAINT "room_memberships_room_id_flight_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."flight_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_memberships" ADD CONSTRAINT "room_memberships_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_room_id_flight_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."flight_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_membership_id_room_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."room_memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_selections" ADD CONSTRAINT "room_selections_membership_id_room_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."room_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_rules_acceptances" ADD CONSTRAINT "community_rules_acceptances_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_room_id_flight_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."flight_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_reporter_id_auth_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_target_user_id_auth_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_message_id_room_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."room_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_auth_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_auth_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_funnel_id_analytics_funnels_id_fk" FOREIGN KEY ("funnel_id") REFERENCES "public"."analytics_funnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_account_userId_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_session_userId_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "flight_rooms_closes_at_idx" ON "flight_rooms" USING btree ("closes_at");--> statement-breakpoint
CREATE INDEX "flight_rooms_message_purge_at_idx" ON "flight_rooms" USING btree ("message_purge_at");--> statement-breakpoint
CREATE INDEX "room_connection_tickets_room_user_idx" ON "room_connection_tickets" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_memberships_room_user_unique" ON "room_memberships" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE INDEX "room_memberships_room_idx" ON "room_memberships" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_messages_room_client_unique" ON "room_messages" USING btree ("room_id","client_message_id");--> statement-breakpoint
CREATE INDEX "room_messages_room_sequence_idx" ON "room_messages" USING btree ("room_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "safety_reports_member_retry_unique" ON "safety_reports" USING btree ("reporter_id","target_user_id") WHERE "safety_reports"."message_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "safety_reports_message_retry_unique" ON "safety_reports" USING btree ("reporter_id","target_user_id","message_id") WHERE "safety_reports"."message_id" is not null;--> statement-breakpoint
CREATE INDEX "safety_reports_room_status_idx" ON "safety_reports" USING btree ("room_id","status");--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_active_idx" ON "user_blocks" USING btree ("blocked_id","active");--> statement-breakpoint
CREATE INDEX "analytics_events_name_time_idx" ON "analytics_events" USING btree ("event_name","event_time");--> statement-breakpoint
CREATE INDEX "analytics_funnels_status_activity_idx" ON "analytics_funnels" USING btree ("status","last_activity_at");