CREATE TYPE "public"."analytics_event_name" AS ENUM('funnel_started', 'flight_recognized', 'recommendations_viewed', 'transport_selected', 'room_joined', 'chat_activated', 'funnel_abandoned');--> statement-breakpoint
CREATE TYPE "public"."analytics_funnel_status" AS ENUM('active', 'completed', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."analytics_funnel_step" AS ENUM('funnel_started', 'flight_recognized', 'recommendations_viewed', 'transport_selected', 'room_joined', 'chat_activated');--> statement-breakpoint
CREATE TYPE "public"."analytics_room_occupancy_bucket" AS ENUM('one', 'two_to_five', 'six_plus');--> statement-breakpoint
CREATE TYPE "public"."analytics_transport_kind" AS ENUM('public_transport', 'shared_taxi');--> statement-breakpoint
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
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_funnel_id_analytics_funnels_id_fk" FOREIGN KEY ("funnel_id") REFERENCES "public"."analytics_funnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_name_time_idx" ON "analytics_events" USING btree ("event_name","event_time");--> statement-breakpoint
CREATE INDEX "analytics_funnels_status_activity_idx" ON "analytics_funnels" USING btree ("status","last_activity_at");