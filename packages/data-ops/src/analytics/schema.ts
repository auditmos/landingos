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

export const AnalyticsEventSchema = z
	.strictObject({
		eventName: AnalyticsEventNameSchema,
		eventTime: z.string().datetime({ offset: true }),
		funnelId: FunnelIdSchema,
		actorPseudonym: ActorPseudonymSchema.nullable(),
		lastCompletedStep: AnalyticsFunnelStepSchema,
		transportKind: TransportKindSchema.nullable(),
		roomOccupancyBucket: RoomOccupancyBucketSchema.nullable(),
		schemaVersion: z.literal(ANALYTICS_SCHEMA_VERSION),
	})
	.superRefine((event, context) => {
		const authenticated = ["transport_selected", "room_joined", "chat_activated"].includes(
			event.eventName,
		);
		if (authenticated !== (event.actorPseudonym !== null)) {
			context.addIssue({ code: "custom", message: "Nieprawidłowy aktor zdarzenia." });
		}
		if ((event.eventName === "transport_selected") !== (event.transportKind !== null)) {
			context.addIssue({ code: "custom", message: "Nieprawidłowy rodzaj transportu." });
		}
		if ((event.eventName === "room_joined") !== (event.roomOccupancyBucket !== null)) {
			context.addIssue({ code: "custom", message: "Nieprawidłowy przedział liczby osób." });
		}
		if (event.eventName !== "funnel_abandoned" && event.lastCompletedStep !== event.eventName) {
			context.addIssue({ code: "custom", message: "Nieprawidłowy ukończony krok." });
		}
		if (event.eventName === "funnel_abandoned" && event.lastCompletedStep === "chat_activated") {
			context.addIssue({ code: "custom", message: "Ukończony lejek nie może być porzucony." });
		}
	});

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
