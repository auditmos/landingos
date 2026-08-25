ALTER TABLE "user_blocks" ADD COLUMN "unblocked_at" timestamp with time zone;--> statement-breakpoint
UPDATE "user_blocks" SET "unblocked_at" = CASE WHEN "active" THEN NULL ELSE COALESCE("hidden_through", "updated_at") END;--> statement-breakpoint
DROP INDEX "user_blocks_blocked_active_idx";--> statement-breakpoint
ALTER TABLE "user_blocks" DROP COLUMN "active";--> statement-breakpoint
ALTER TABLE "user_blocks" DROP COLUMN "hidden_through";--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_active_idx" ON "user_blocks" USING btree ("blocked_id") WHERE "user_blocks"."unblocked_at" is null;