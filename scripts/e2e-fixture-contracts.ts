import { randomUUID } from "node:crypto";
import {
	DestinationAutocompleteResultSchema,
	DestinationSelectionResultSchema,
} from "../packages/data-ops/dist/destination/index.js";
import { FlightResolveResultSchema } from "../packages/data-ops/dist/flight/index.js";
import { JourneyRecommendationResultSchema } from "../packages/data-ops/dist/journey/index.js";
import {
	ConnectionTicketResponseSchema,
	PublicRoomMemberSchema,
	RoomMessageCreateResponseSchema,
	RoomSnapshotSchema,
} from "../packages/data-ops/dist/room/index.js";
import {
	BlockedMembersResponseSchema,
	COMMUNITY_RULES_TOPICS,
	COMMUNITY_RULES_VERSION,
	CommunityRulesAcceptanceResponseSchema,
	CommunityRulesStatusResponseSchema,
	RoomBlockResponseSchema,
	SafetyReportCreateResponseSchema,
	SafetyReportQueueResponseSchema,
} from "../packages/data-ops/dist/safety/index.js";
import {
	fixtureConnectionTicket,
	fixtureFlight,
	fixtureJourneyVariant,
	fixtureNoTrustworthyRoute,
} from "./e2e-fixture-data.ts";
import { FixtureStore, type FixtureUser } from "./e2e-fixture-store.ts";

interface Contract<T> {
	parse(value: unknown): T;
}

export class FixtureContractError extends Error {
	constructor(
		public readonly family: string,
		cause: unknown,
	) {
		super(
			`Fixture response "${family}" no longer matches its data-ops schema — the e2e harness would be testing a shape the real API does not serve. ${
				cause instanceof Error ? cause.message : String(cause)
			}`,
		);
		this.name = "FixtureContractError";
	}
}

/**
 * Parses a fixture payload through the schema the real API answers with.
 *
 * Without this the fixture server is free to keep serving a shape the product
 * abandoned, and `pnpm run test:e2e` stays green while the contract has moved.
 */
export function contract<T>(family: string, schema: Contract<T>, value: unknown): T {
	try {
		return schema.parse(value);
	} catch (cause) {
		throw new FixtureContractError(family, cause);
	}
}

/**
 * Drives one representative payload through every response family the fixture
 * server serves, so contract drift fails when the harness starts rather than
 * whenever a scenario happens to touch the affected endpoint.
 */
export function assertFixtureContracts(): void {
	contract("flights/resolve", FlightResolveResultSchema, fixtureFlight("FR1234"));
	contract(
		"flights/manual",
		FlightResolveResultSchema,
		fixtureFlight("W61431", {
			manual: true,
			departureLocalDate: "2026-09-14",
			scheduledArrivalUtc: "2026-09-14T08:20:00Z",
			id: "flight-manual",
			manualArrivalConflict: {
				requestedScheduledArrivalUtc: "2026-09-14T08:37:00Z",
				sharedScheduledArrivalUtc: "2026-09-14T08:20:00Z",
			},
		}),
	);
	contract("flights/resolve:manual_required", FlightResolveResultSchema, {
		status: "manual_required",
		reason: "not_found",
		flightNumber: "FR404",
		departureLocalDate: "2026-09-14",
	});
	contract("destinations/autocomplete", DestinationAutocompleteResultSchema, {
		status: "suggestions",
		predictions: [
			{
				placeId: "fixture:duomo",
				primaryText: "Duomo di Milano",
				secondaryText: "Mediolan, Włochy",
			},
		],
	});
	contract("destinations/autocomplete:unavailable", DestinationAutocompleteResultSchema, {
		status: "autocomplete_unavailable",
		reason: "provider_error",
	});
	contract("destinations/select", DestinationSelectionResultSchema, {
		status: "destination_selected",
		destination: {
			placeId: "fixture:duomo",
			displayName: "Duomo di Milano",
			coordinates: { latitude: 45.4642, longitude: 9.19 },
			supportedAreaVersion: "milan-municipality-v1",
		},
	});
	contract("destinations/select:not_supported", DestinationSelectionResultSchema, {
		status: "destination_not_supported",
		supportedAreaVersion: "milan-municipality-v1",
	});
	contract("journeys/recommend", JourneyRecommendationResultSchema, {
		status: "recommendations",
		variants: [fixtureJourneyVariant()],
		explanation: null,
	});
	contract(
		"journeys/recommend:no_route",
		JourneyRecommendationResultSchema,
		fixtureNoTrustworthyRoute(),
	);

	assertRoomAndSafetyContracts();
}

/** Room and safety shapes come out of the store, so they are exercised for real. */
function assertRoomAndSafetyContracts(): void {
	const store = new FixtureStore();
	const user = seedUser(store, "contract-check@example.test", "Kontrakt");
	const roomId = store.joinRoom(user, "flight-fr1234");

	contract("rooms/{id}", RoomSnapshotSchema, store.snapshot(roomId, user));
	// The same selection the e2e scenarios send, so the check exercises the
	// shape the harness actually stores rather than an invented one.
	store.updateSelection(roomId, user.id, {
		kind: "public_transport",
		badges: ["recommended"],
		modes: ["bus"],
		operatorNames: ["Airport Bus Express"],
	});
	contract("rooms/{id}/selection", PublicRoomMemberSchema, store.member(roomId, user.id));
	contract(
		"rooms/{id}/messages",
		RoomMessageCreateResponseSchema,
		store.createMessage(roomId, user, randomUUID(), "Kontrakt wiadomości."),
	);
	contract("rooms/{id}/tickets", ConnectionTicketResponseSchema, fixtureConnectionTicket());
	contract("safety/rules", CommunityRulesStatusResponseSchema, {
		version: COMMUNITY_RULES_VERSION,
		accepted: user.rulesAccepted,
		topics: COMMUNITY_RULES_TOPICS,
	});
	contract("safety/rules/accept", CommunityRulesAcceptanceResponseSchema, {
		version: COMMUNITY_RULES_VERSION,
		acceptedAt: new Date(0).toISOString(),
		created: true,
	});
	contract("safety/rooms/{id}/blocks", BlockedMembersResponseSchema, {
		blockedPseudonyms: store.blockedPseudonyms(user.id),
	});
	contract("safety/rooms/{id}/blocks:put", RoomBlockResponseSchema, {
		blockedPseudonym: "Inny",
		active: true,
		changed: true,
	});
	contract(
		"safety/rooms/{id}/reports",
		SafetyReportCreateResponseSchema,
		store.createReport(user.id, roomId, {
			targetType: "member",
			targetPseudonym: "Inny",
			reason: "harassment_or_discrimination",
		}),
	);
	contract("operator/reports", SafetyReportQueueResponseSchema, store.listReports({}));
}

function seedUser(store: FixtureStore, email: string, pseudonym: string): FixtureUser {
	store.requestOtp(email);
	const otp = store.latestOtp(email);
	const user = store.verifyOtp(email, String(otp));
	if (!user) throw new Error(`Fixture contract check could not seed ${email}`);
	store.updatePseudonym(user.id, pseudonym);
	store.acceptRules(user.id);
	return store.userById(user.id) ?? user;
}
