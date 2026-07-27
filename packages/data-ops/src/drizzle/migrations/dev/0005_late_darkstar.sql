ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "operator_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "service_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "origin_iata" SET DEFAULT 'BGY';--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "destination_stop_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "destination_stop_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "duration_minutes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "transfer_count" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "walking_minutes" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "walking_meters" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "source_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "checked_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "cost_minor_min" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "cost_minor_max" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "purchase_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "publication_status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "transfer_catalog_entries" ALTER COLUMN "provenance" SET DEFAULT 'operator_verified';