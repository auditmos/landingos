import { z } from "zod";

export const ANALYTICS_SCHEMA_VERSION = "2026-07-27-v1";
export const ANALYTICS_FUNNEL_HEADER = "X-LandingOS-Funnel-Id";

export const ANALYTICS_EVENT_NAMES = [
	"funnel_started",
	"flight_recognized",
	"recommendations_viewed",
	"transport_selected",
	"room_joined",
	"chat_activated",
	"funnel_abandoned",
] as const;

export const ANALYTICS_FUNNEL_STEPS = [
	"funnel_started",
	"flight_recognized",
	"recommendations_viewed",
	"transport_selected",
	"room_joined",
	"chat_activated",
] as const;

export const FunnelIdSchema = z
	.string()
	.regex(/^[0-9a-f]{32}$/, "Nieprawidłowy identyfikator lejka.");
export const ActorPseudonymSchema = z
	.string()
	.regex(/^[0-9a-f]{64}$/, "Nieprawidłowy pseudonim analityczny.");
export const AnalyticsEventNameSchema = z.enum(ANALYTICS_EVENT_NAMES);
export const AnalyticsFunnelStepSchema = z.enum(ANALYTICS_FUNNEL_STEPS);
export const AnalyticsFunnelStatusSchema = z.enum(["active", "completed", "abandoned"]);
export const TransportKindSchema = z.enum(["public_transport", "shared_taxi"]);
export const RoomOccupancyBucketSchema = z.enum(["one", "two_to_five", "six_plus"]);

const EventTimeSchema = z.string().datetime({ offset: true });
const SchemaVersionSchema = z.literal(ANALYTICS_SCHEMA_VERSION);
const NoActorSchema = z.null("Zdarzenie anonimowe nie może mieć aktora.");
const NoTransportKindSchema = z.null("Rodzaj transportu dotyczy tylko wyboru transportu.");
const NoRoomOccupancySchema = z.null("Przedział liczby osób dotyczy tylko dołączenia do pokoju.");
/** A funnel that reached chat is complete, so it can never be the step an abandon reports. */
const AbandonedStepSchema = AnalyticsFunnelStepSchema.exclude(["chat_activated"]);

/**
 * One variant per event name. Each declares all eight columns in the locked order, so the
 * parsed row stays flat and its key order stable, while actor, transport kind, and occupancy
 * bucket travel with the event name instead of being cross-checked afterwards.
 */
function analyticsEventVariant<
	Name extends AnalyticsEventName,
	Actor extends z.ZodType,
	Step extends z.ZodType,
	Transport extends z.ZodType,
	Occupancy extends z.ZodType,
>(
	eventName: Name,
	actorPseudonym: Actor,
	lastCompletedStep: Step,
	transportKind: Transport,
	roomOccupancyBucket: Occupancy,
) {
	return z.strictObject({
		eventName: z.literal(eventName),
		eventTime: EventTimeSchema,
		funnelId: FunnelIdSchema,
		actorPseudonym,
		lastCompletedStep,
		transportKind,
		roomOccupancyBucket,
		schemaVersion: SchemaVersionSchema,
	});
}

export const AnalyticsEventSchema = z.discriminatedUnion("eventName", [
	analyticsEventVariant(
		"funnel_started",
		NoActorSchema,
		z.literal("funnel_started"),
		NoTransportKindSchema,
		NoRoomOccupancySchema,
	),
	analyticsEventVariant(
		"flight_recognized",
		NoActorSchema,
		z.literal("flight_recognized"),
		NoTransportKindSchema,
		NoRoomOccupancySchema,
	),
	analyticsEventVariant(
		"recommendations_viewed",
		NoActorSchema,
		z.literal("recommendations_viewed"),
		NoTransportKindSchema,
		NoRoomOccupancySchema,
	),
	analyticsEventVariant(
		"transport_selected",
		ActorPseudonymSchema,
		z.literal("transport_selected"),
		TransportKindSchema,
		NoRoomOccupancySchema,
	),
	analyticsEventVariant(
		"room_joined",
		ActorPseudonymSchema,
		z.literal("room_joined"),
		NoTransportKindSchema,
		RoomOccupancyBucketSchema,
	),
	analyticsEventVariant(
		"chat_activated",
		ActorPseudonymSchema,
		z.literal("chat_activated"),
		NoTransportKindSchema,
		NoRoomOccupancySchema,
	),
	analyticsEventVariant(
		"funnel_abandoned",
		NoActorSchema,
		AbandonedStepSchema,
		NoTransportKindSchema,
		NoRoomOccupancySchema,
	),
]);

/**
 * One name per member, never a union of names: narrowing has to be able to discard a member
 * whole. The actor field is declared and forbidden, so passing one is a compile error.
 */
type AnonymousEvent<Actor extends string, Name extends AnalyticsEventName> = {
	eventName: Name;
} & Partial<Record<Actor, never>>;

/**
 * The events a caller may record, one variant per name — the funnel boundary events are
 * written by the ledger itself, never tracked. The actor field is named by the caller's
 * currency: data-service holds a raw `userId` and hashes it, data-ops stores the derived
 * `actorPseudonym`. One definition, two projections, so neither package keeps a copy.
 */
export type AnalyticsEventInput<Actor extends string = "actorPseudonym"> =
	| AnonymousEvent<Actor, "flight_recognized">
	| AnonymousEvent<Actor, "recommendations_viewed">
	| ({ eventName: "transport_selected"; transportKind: TransportKind } & Record<Actor, string>)
	| ({
			eventName: "room_joined";
			roomOccupancyBucket: RoomOccupancyBucket;
	  } & Record<Actor, string>)
	| ({ eventName: "chat_activated" } & Record<Actor, string>);

export const AnalyticsFunnelStateSchema = z.strictObject({
	funnelId: FunnelIdSchema,
	status: AnalyticsFunnelStatusSchema,
	lastCompletedStep: AnalyticsFunnelStepSchema,
	createdAt: z.string().datetime({ offset: true }),
	lastActivityAt: z.string().datetime({ offset: true }),
});

const EventCountsSchema = z.strictObject(
	Object.fromEntries(
		ANALYTICS_EVENT_NAMES.map((name) => [name, z.number().int().nonnegative()]),
	) as {
		[K in (typeof ANALYTICS_EVENT_NAMES)[number]]: z.ZodNumber;
	},
);

const AbandonmentCountsSchema = z.strictObject(
	Object.fromEntries(
		ANALYTICS_FUNNEL_STEPS.map((name) => [name, z.number().int().nonnegative()]),
	) as {
		[K in (typeof ANALYTICS_FUNNEL_STEPS)[number]]: z.ZodNumber;
	},
);

export const AnalyticsFunnelReportSchema = z.strictObject({
	totalFunnels: z.number().int().nonnegative(),
	eventCounts: EventCountsSchema,
	rates: z.strictObject({
		recognition: z.number().min(0).max(1),
		recommendations: z.number().min(0).max(1),
		selection: z.number().min(0).max(1),
		roomEntry: z.number().min(0).max(1),
		chatActivation: z.number().min(0).max(1),
		abandonment: z.number().min(0).max(1),
	}),
	abandonmentByStep: AbandonmentCountsSchema,
	socialRoomCount: z.number().int().nonnegative(),
	repeatFlightActorCount: z.number().int().nonnegative(),
});

export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;
export type AnalyticsEventName = z.infer<typeof AnalyticsEventNameSchema>;
export type AnalyticsFunnelStep = z.infer<typeof AnalyticsFunnelStepSchema>;
export type AnalyticsFunnelState = z.infer<typeof AnalyticsFunnelStateSchema>;
export type AnalyticsFunnelReport = z.infer<typeof AnalyticsFunnelReportSchema>;
export type TransportKind = z.infer<typeof TransportKindSchema>;
export type RoomOccupancyBucket = z.infer<typeof RoomOccupancyBucketSchema>;
