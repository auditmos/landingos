import { z } from "zod";

const PSEUDONYM_MIN_CODE_POINTS = 3;
const PSEUDONYM_MAX_CODE_POINTS = 24;
const PSEUDONYM_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N}_-]| (?=[\p{L}\p{N}_-]))*[\p{L}\p{N}]$/u;

export function normalizePseudonym(value: string): string {
	return value.normalize("NFC").trim();
}

export const PseudonymSchema = z.preprocess(
	(value) => (typeof value === "string" ? normalizePseudonym(value) : value),
	z.string().superRefine((value, context) => {
		const codePointLength = Array.from(value).length;
		if (
			codePointLength < PSEUDONYM_MIN_CODE_POINTS ||
			codePointLength > PSEUDONYM_MAX_CODE_POINTS
		) {
			context.addIssue({
				code: "custom",
				message: "Pseudonim musi mieć od 3 do 24 znaków.",
			});
		}
		if (!PSEUDONYM_PATTERN.test(value)) {
			context.addIssue({
				code: "custom",
				message:
					"Pseudonim może zawierać litery, cyfry, pojedyncze spacje, _ i - oraz musi zaczynać i kończyć się literą lub cyfrą.",
			});
		}
	}),
);

export const ProfileUpdateRequestSchema = z.strictObject({
	pseudonym: PseudonymSchema,
});

export const PublicProfileSchema = z.object({
	id: z.string().min(1),
	pseudonym: PseudonymSchema,
});

export const MarketingConsentUpdateRequestSchema = z
	.strictObject({
		granted: z.boolean(),
		policyVersion: z.string().trim().min(1).optional(),
	})
	.superRefine((value, context) => {
		if (value.granted && !value.policyVersion) {
			context.addIssue({
				code: "custom",
				path: ["policyVersion"],
				message: "Wersja zgody jest wymagana przy jej udzieleniu.",
			});
		}
	});

export const ProfilePatchRequestSchema = z.discriminatedUnion("action", [
	z.strictObject({
		action: z.literal("pseudonym"),
		pseudonym: PseudonymSchema,
	}),
	z
		.strictObject({
			action: z.literal("marketing_consent"),
			granted: z.boolean(),
			policyVersion: z.string().trim().min(1).optional(),
		})
		.superRefine((value, context) => {
			if (value.granted && !value.policyVersion) {
				context.addIssue({
					code: "custom",
					path: ["policyVersion"],
					message: "Wersja zgody jest wymagana przy jej udzieleniu.",
				});
			}
		}),
]);

export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateRequestSchema>;
export type PublicProfile = z.infer<typeof PublicProfileSchema>;
export type MarketingConsentUpdateRequest = z.infer<typeof MarketingConsentUpdateRequestSchema>;
export type ProfilePatchRequest = z.infer<typeof ProfilePatchRequestSchema>;
