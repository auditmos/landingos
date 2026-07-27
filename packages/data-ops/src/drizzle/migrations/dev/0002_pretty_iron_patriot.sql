CREATE TABLE "auth_rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "pseudonym" text;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "marketing_consent_granted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "marketing_consent_policy_version" text;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "marketing_consent_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
CREATE INDEX "auth_account_userId_idx" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_session_userId_idx" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "auth_verification" USING btree ("identifier");--> statement-breakpoint
ALTER TABLE "auth_user" DROP COLUMN "approved";