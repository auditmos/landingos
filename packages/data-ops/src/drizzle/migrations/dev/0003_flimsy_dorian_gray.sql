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
