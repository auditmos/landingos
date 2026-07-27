import { z } from "zod";
import { PseudonymSchema } from "@/identity/schema";

export const COMMUNITY_RULES_VERSION = "2026-07-26-v1";

export const COMMUNITY_RULES_TOPICS = [
	"Szanuj innych. Nie nękaj, nie groź, nie dyskryminuj i nie podszywaj się pod inne osoby.",
	"Nie wywieraj presji dotyczącej pieniędzy ani prywatnych informacji. Nie udostępniaj danych osobowych innych osób.",
	"LandingOS nie weryfikuje tożsamości ani nie gwarantuje wspólnego przejazdu. Kieruj się rozsądkiem — blokuj i zgłaszaj problemy.",
	"Nie publikuj nielegalnych treści ani komercyjnego spamu.",
] as const;

export const CommunityRulesAcceptanceRequestSchema = z.strictObject({
	version: z.string().trim().min(1, "Wersja zasad jest wymagana."),
});

export const CommunityRulesStatusResponseSchema = z.strictObject({
	version: z.string().min(1),
	accepted: z.boolean(),
	topics: z.tuple([
		z.literal(COMMUNITY_RULES_TOPICS[0]),
		z.literal(COMMUNITY_RULES_TOPICS[1]),
		z.literal(COMMUNITY_RULES_TOPICS[2]),
		z.literal(COMMUNITY_RULES_TOPICS[3]),
	]),
});

export const CommunityRulesAcceptanceResponseSchema = z.strictObject({
	version: z.string().min(1),
	acceptedAt: z.string().datetime({ offset: true }),
	created: z.boolean(),
});

export const SafetyReportReasonSchema = z.enum([
	"harassment_or_discrimination",
	"threats_or_impersonation",
	"money_or_private_information",
	"personal_data",
	"illegal_content",
	"commercial_spam",
	"other",
]);

function normalizeNote(value: string) {
	return value.normalize("NFC").trim();
}

export const SafetyReportNoteSchema = z.preprocess(
	(value) => (typeof value === "string" ? normalizeNote(value) : value),
	z.string().superRefine((value, context) => {
		if (Array.from(value).length > 500) {
			context.addIssue({
				code: "custom",
				message: "Notatka może mieć najwyżej 500 znaków.",
			});
		}
	}),
);

const SafetyReportFieldsSchema = z.strictObject({
	reason: SafetyReportReasonSchema,
	note: SafetyReportNoteSchema.optional(),
});

export const SafetyReportCreateRequestSchema = z.discriminatedUnion("targetType", [
	SafetyReportFieldsSchema.extend({
		targetType: z.literal("member"),
		targetPseudonym: PseudonymSchema,
	}),
	SafetyReportFieldsSchema.extend({
		targetType: z.literal("message"),
		messageId: z.string().uuid("Nieprawidłowy identyfikator wiadomości."),
	}),
]);

export const RoomBlockRequestSchema = z.strictObject({
	targetPseudonym: PseudonymSchema,
});

export const BlockedMembersResponseSchema = z.strictObject({
	blockedPseudonyms: z.array(PseudonymSchema),
});

export const RoomBlockResponseSchema = z.strictObject({
	blockedPseudonym: PseudonymSchema,
	active: z.boolean(),
	changed: z.boolean(),
});

export const SafetyReportEvidenceSchema = z.strictObject({
	messageText: z.string().min(1),
	authorPseudonym: PseudonymSchema,
	originalMessageAt: z.string().datetime({ offset: true }),
});

export const SafetyReportRecordSchema = z.strictObject({
	id: z.string().uuid(),
	roomId: z.string().uuid(),
	reporterId: z.string().min(1),
	targetUserId: z.string().min(1),
	messageId: z.string().uuid().nullable(),
	reason: SafetyReportReasonSchema,
	note: SafetyReportNoteSchema.nullable(),
	status: z.literal("open"),
	evidenceSnapshot: SafetyReportEvidenceSchema.nullable(),
	createdAt: z.string().datetime({ offset: true }),
});

export const SafetyReportCreateResponseSchema = z.strictObject({
	reportId: z.string().uuid(),
	status: z.literal("open"),
	created: z.boolean(),
});

export type CommunityRulesAcceptanceRequest = z.infer<typeof CommunityRulesAcceptanceRequestSchema>;
export type CommunityRulesStatusResponse = z.infer<typeof CommunityRulesStatusResponseSchema>;
export type CommunityRulesAcceptanceResponse = z.infer<
	typeof CommunityRulesAcceptanceResponseSchema
>;
export type SafetyReportReason = z.infer<typeof SafetyReportReasonSchema>;
export type SafetyReportCreateRequest = z.infer<typeof SafetyReportCreateRequestSchema>;
export type SafetyReportEvidence = z.infer<typeof SafetyReportEvidenceSchema>;
export type SafetyReportRecord = z.infer<typeof SafetyReportRecordSchema>;
export type SafetyReportCreateResponse = z.infer<typeof SafetyReportCreateResponseSchema>;
export type RoomBlockRequest = z.infer<typeof RoomBlockRequestSchema>;
export type RoomBlockResponse = z.infer<typeof RoomBlockResponseSchema>;
export type BlockedMembersResponse = z.infer<typeof BlockedMembersResponseSchema>;
