import { eq } from "drizzle-orm";
import type { getDb } from "@/database/setup";
import { auth_user } from "@/drizzle/auth-schema";
import {
	type MarketingConsentUpdateRequest,
	MarketingConsentUpdateRequestSchema,
	ProfileUpdateRequestSchema,
} from "./schema";

type IdentityDatabase = Pick<ReturnType<typeof getDb>, "select" | "update">;

const identityProfileSelection = {
	id: auth_user.id,
	emailVerified: auth_user.emailVerified,
	pseudonym: auth_user.pseudonym,
	marketingConsentGranted: auth_user.marketingConsentGranted,
	marketingConsentPolicyVersion: auth_user.marketingConsentPolicyVersion,
	marketingConsentUpdatedAt: auth_user.marketingConsentUpdatedAt,
	role: auth_user.role,
};

export interface IdentityProfile {
	id: string;
	emailVerified: boolean;
	pseudonym: string | null;
	marketingConsentGranted: boolean;
	marketingConsentPolicyVersion: string | null;
	marketingConsentUpdatedAt: Date | null;
	role: string;
}

export async function getIdentityProfile(
	db: IdentityDatabase,
	userId: string,
): Promise<IdentityProfile | null> {
	const [profile] = await db
		.select(identityProfileSelection)
		.from(auth_user)
		.where(eq(auth_user.id, userId))
		.limit(1);
	return profile ?? null;
}

export async function updatePseudonym(
	db: IdentityDatabase,
	userId: string,
	pseudonym: string,
): Promise<IdentityProfile | null> {
	const normalized = ProfileUpdateRequestSchema.parse({ pseudonym }).pseudonym;
	const updated = await db
		.update(auth_user)
		.set({ pseudonym: normalized })
		.where(eq(auth_user.id, userId))
		.returning({ id: auth_user.id });
	if (updated.length === 0) {
		return null;
	}
	return getIdentityProfile(db, userId);
}

export async function updateMarketingConsent(
	db: IdentityDatabase,
	userId: string,
	input: MarketingConsentUpdateRequest,
	updatedAt = new Date(),
): Promise<IdentityProfile | null> {
	const consent = MarketingConsentUpdateRequestSchema.parse(input);
	const updated = await db
		.update(auth_user)
		.set({
			marketingConsentGranted: consent.granted,
			marketingConsentPolicyVersion: consent.granted ? consent.policyVersion : undefined,
			marketingConsentUpdatedAt: updatedAt,
		})
		.where(eq(auth_user.id, userId))
		.returning({ id: auth_user.id });
	if (updated.length === 0) {
		return null;
	}
	return getIdentityProfile(db, userId);
}

export function isRoomReady(
	profile: IdentityProfile | null | undefined,
): profile is IdentityProfile & { pseudonym: string } {
	return Boolean(
		profile?.emailVerified &&
			profile.pseudonym &&
			ProfileUpdateRequestSchema.safeParse({ pseudonym: profile.pseudonym }).success,
	);
}
