ALTER TYPE "public"."safety_report_status" ADD VALUE 'resolved';--> statement-breakpoint
ALTER TABLE "safety_reports" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD COLUMN "resolved_by" text;--> statement-breakpoint
ALTER TABLE "safety_reports" ADD CONSTRAINT "safety_reports_resolved_by_auth_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;