ALTER TABLE "room_memberships" ADD COLUMN "pseudonym" text;--> statement-breakpoint
UPDATE "room_memberships" SET "pseudonym" = "auth_user"."pseudonym" FROM "auth_user" WHERE "auth_user"."id" = "room_memberships"."user_id";--> statement-breakpoint
DO $$ DECLARE orphaned bigint; BEGIN SELECT count(*) INTO orphaned FROM "room_memberships" WHERE "pseudonym" IS NULL; IF orphaned > 0 THEN RAISE EXCEPTION 'Nie mozna zamrozic pseudonimow: % czlonkostw nalezy do kont bez pseudonimu.', orphaned; END IF; END $$;--> statement-breakpoint
ALTER TABLE "room_memberships" ALTER COLUMN "pseudonym" SET NOT NULL;
