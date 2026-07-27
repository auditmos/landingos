CREATE TABLE "flight_rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"flight_instance_id" text NOT NULL,
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
	"membership_id" uuid NOT NULL,
	"client_message_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_selections" (
	"membership_id" uuid PRIMARY KEY NOT NULL,
	"selection" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flight_rooms" ADD CONSTRAINT "flight_rooms_flight_instance_id_flight_instances_id_fk" FOREIGN KEY ("flight_instance_id") REFERENCES "public"."flight_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_connection_tickets" ADD CONSTRAINT "room_connection_tickets_room_id_flight_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."flight_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_connection_tickets" ADD CONSTRAINT "room_connection_tickets_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_memberships" ADD CONSTRAINT "room_memberships_room_id_flight_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."flight_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_memberships" ADD CONSTRAINT "room_memberships_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_room_id_flight_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."flight_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_messages" ADD CONSTRAINT "room_messages_membership_id_room_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."room_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_selections" ADD CONSTRAINT "room_selections_membership_id_room_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."room_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_connection_tickets_room_user_idx" ON "room_connection_tickets" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_memberships_room_user_unique" ON "room_memberships" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE INDEX "room_memberships_room_idx" ON "room_memberships" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_messages_room_client_unique" ON "room_messages" USING btree ("room_id","client_message_id");--> statement-breakpoint
CREATE INDEX "room_messages_room_sequence_idx" ON "room_messages" USING btree ("room_id","sequence");