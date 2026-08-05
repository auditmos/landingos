import { z } from "zod";
import { FlightInstanceSchema } from "@/flight/schema";
import { PseudonymSchema } from "@/identity/schema";

export const RoomIdSchema = z.string().uuid("Nieprawidłowy identyfikator pokoju.");
export const ClientMessageIdSchema = z
	.string()
	.uuid("Identyfikator wiadomości musi mieć format UUID.");

export const RoomJoinRequestSchema = z.strictObject({
	flightInstanceId: z.string().min(1, "Wybierz rozpoznany lot."),
});

export const RoomTransportBadgeSchema = z.enum(["recommended", "fastest", "simplest"]);
export const RoomTransportModeSchema = z.enum(["bus", "train", "metro", "tram", "walk"]);

function uniqueValues(values: readonly string[]) {
	return new Set(values).size === values.length;
}

const OperatorNameSchema = z
	.string()
	.trim()
	.min(1)
	.superRefine((value, context) => {
		if (Array.from(value).length > 80) {
			context.addIssue({
				code: "custom",
				message: "Nazwa operatora może mieć najwyżej 80 znaków.",
			});
		}
	});

/**
 * Voluntarily shared drop-off point. Bounded free text only — geographic
 * identifiers stay banned from room payloads. Absent by default (hidden);
 * present only after the traveler explicitly opts in, revocable anytime.
 */
export const DropOffTextSchema = z
	.string()
	.trim()
	.min(1, "Punkt wysiadki nie może być pusty.")
	.max(120, "Punkt wysiadki może mieć najwyżej 120 znaków.");

export const PublicTransportSelectionSchema = z.strictObject({
	kind: z.literal("public_transport"),
	dropOffText: DropOffTextSchema.optional(),
	badges: z
		.array(RoomTransportBadgeSchema)
		.max(3, "Można zapisać najwyżej 3 oznaczenia wariantu.")
		.refine(uniqueValues, "Oznaczenia wariantu nie mogą się powtarzać."),
	modes: z
		.array(RoomTransportModeSchema)
		.min(1, "Wybierz co najmniej jeden środek transportu.")
		.max(5, "Można zapisać najwyżej 5 środków transportu.")
		.refine(uniqueValues, "Środki transportu nie mogą się powtarzać."),
	operatorNames: z
		.array(OperatorNameSchema)
		.max(8, "Można zapisać najwyżej 8 operatorów.")
		.refine(uniqueValues, "Nazwy operatorów nie mogą się powtarzać."),
});

export const SharedTaxiSelectionSchema = z.strictObject({
	kind: z.literal("shared_taxi"),
	dropOffText: DropOffTextSchema.optional(),
});

export const RoomSelectionSchema = z.discriminatedUnion("kind", [
	PublicTransportSelectionSchema,
	SharedTaxiSelectionSchema,
]);

export const RoomSelectionUpdateRequestSchema = z.strictObject({
	selection: RoomSelectionSchema,
});

export const PublicRoomMemberSchema = z.strictObject({
	pseudonym: PseudonymSchema,
	selection: RoomSelectionSchema.nullable(),
});

function normalizeMessageContent(value: string) {
	return value.normalize("NFC").trim();
}

export const RoomMessageContentSchema = z.preprocess(
	(value) => (typeof value === "string" ? normalizeMessageContent(value) : value),
	z.string().superRefine((value, context) => {
		const length = Array.from(value).length;
		if (length < 1 || length > 1_000) {
			context.addIssue({
				code: "custom",
				message: "Wiadomość musi mieć od 1 do 1000 znaków.",
			});
		}
	}),
);

export const RoomMessageCreateRequestSchema = z.strictObject({
	clientMessageId: ClientMessageIdSchema,
	content: RoomMessageContentSchema,
});

export const PublicRoomMessageSchema = z.strictObject({
	id: z.string().uuid(),
	clientMessageId: ClientMessageIdSchema,
	pseudonym: PseudonymSchema,
	content: RoomMessageContentSchema,
	createdAt: z.string().datetime({ offset: true }),
});

export const RoomMessageCreateResponseSchema = z.strictObject({
	message: PublicRoomMessageSchema,
	created: z.boolean(),
});

export const PublicRoomSchema = z.strictObject({
	id: RoomIdSchema,
	flightInstanceId: z.string().min(1),
	closesAt: z.string().datetime({ offset: true }),
});

/**
 * One row of the traveler's room list, carrying the flight context needed to
 * label the trip (number, origin, arrival). `flight` is optional only for
 * rollout tolerance — current servers always include it.
 */
export const RoomListingSchema = z.strictObject({
	id: RoomIdSchema,
	flightInstanceId: z.string().min(1),
	closesAt: z.string().datetime({ offset: true }),
	flight: FlightInstanceSchema.optional(),
});

/**
 * A closed room reduced to its flight identity, for the replan shortcut.
 * Deliberately carries no room id, members, or messages: closed rooms stay
 * gone (US-23) — only the traveler's own flight fact is offered back, and only
 * within the bounded retention window enforced by the query.
 */
export const PastFlightListingSchema = z.strictObject({
	flight: FlightInstanceSchema,
	closedAt: z.string().datetime({ offset: true }),
});

export const RoomSnapshotSchema = z.strictObject({
	room: PublicRoomSchema,
	member: PublicRoomMemberSchema,
	members: z.array(PublicRoomMemberSchema),
	messages: z.array(PublicRoomMessageSchema),
});

export const ConnectionTicketResponseSchema = z.strictObject({
	ticket: z.string().min(32),
	expiresAt: z.string().datetime({ offset: true }),
});

export const ConnectionAttachmentSchema = z.strictObject({
	roomId: RoomIdSchema,
	userId: z.string().min(1),
	closesAt: z.string().datetime({ offset: true }),
});

export const RoomRedactedEventSchema = z.strictObject({
	type: z.literal("room_redacted"),
});

export const RoomRealtimeEventSchema = z.discriminatedUnion("type", [
	z.strictObject({
		type: z.literal("member_joined"),
		member: PublicRoomMemberSchema,
	}),
	z.strictObject({
		type: z.literal("selection_changed"),
		member: PublicRoomMemberSchema,
	}),
	z.strictObject({
		type: z.literal("message_created"),
		message: PublicRoomMessageSchema,
	}),
	RoomRedactedEventSchema,
]);

export const RoomRealtimeErrorSchema = z.strictObject({
	type: z.literal("error"),
	code: z.enum([
		"BINARY_MESSAGE_NOT_SUPPORTED",
		"MESSAGE_TRANSPORT_NOT_SUPPORTED",
		"rules_acceptance_required",
	]),
	error: z.string().min(1),
});

export type PublicTransportSelection = z.infer<typeof PublicTransportSelectionSchema>;
export type RoomJoinRequest = z.infer<typeof RoomJoinRequestSchema>;
export type SharedTaxiSelection = z.infer<typeof SharedTaxiSelectionSchema>;
export type RoomSelection = z.infer<typeof RoomSelectionSchema>;
export type RoomSelectionUpdateRequest = z.infer<typeof RoomSelectionUpdateRequestSchema>;
export type PublicRoomMember = z.infer<typeof PublicRoomMemberSchema>;
export type RoomMessageCreateRequest = z.infer<typeof RoomMessageCreateRequestSchema>;
export type PublicRoomMessage = z.infer<typeof PublicRoomMessageSchema>;
export type RoomMessageCreateResponse = z.infer<typeof RoomMessageCreateResponseSchema>;
export type PublicRoom = z.infer<typeof PublicRoomSchema>;
export type RoomListing = z.infer<typeof RoomListingSchema>;
export type PastFlightListing = z.infer<typeof PastFlightListingSchema>;
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
export type ConnectionTicketResponse = z.infer<typeof ConnectionTicketResponseSchema>;
export type ConnectionAttachment = z.infer<typeof ConnectionAttachmentSchema>;
export type RoomRealtimeEvent = z.infer<typeof RoomRealtimeEventSchema>;
export type RoomRealtimeError = z.infer<typeof RoomRealtimeErrorSchema>;
