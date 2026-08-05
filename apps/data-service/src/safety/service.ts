import {
	COMMUNITY_RULES_TOPICS,
	type CommunityRulesAcceptanceRequest,
	CommunityRulesAcceptanceRequestSchema,
	type CommunityRulesAcceptanceResponse,
	CommunityRulesAcceptanceResponseSchema,
	type CommunityRulesStatusResponse,
	CommunityRulesStatusResponseSchema,
	type RoomBlockRequest,
	RoomBlockRequestSchema,
	type RoomBlockResponse,
	RoomBlockResponseSchema,
	SafetyQueryError,
	type SafetyReportCreateRequest,
	SafetyReportCreateRequestSchema,
	type SafetyReportCreateResponse,
	SafetyReportCreateResponseSchema,
	type SafetyReportStatus,
} from "@repo/data-ops/safety";

export class SafetyServiceError extends Error {
	constructor(
		readonly code:
			| "room_access_denied"
			| "rules_version_outdated"
			| "safety_request_invalid"
			| "safety_target_invalid",
		readonly status: 400 | 403 | 409,
		message: string,
	) {
		super(message);
		this.name = "SafetyServiceError";
	}
}

export interface SafetyServiceDependencies {
	now(): Date;
	rulesVersion: string;
	hasCommunityRulesAcceptance(userId: string, rulesVersion: string): Promise<boolean>;
	acceptCommunityRules(input: {
		userId: string;
		rulesVersion: string;
		acceptedAt?: Date;
	}): Promise<{
		acceptance: { userId: string; rulesVersion: string; acceptedAt: Date };
		created: boolean;
	}>;
	listBlockedMemberPseudonyms(roomId: string, blockerId: string): Promise<string[]>;
	blockRoomMember(input: {
		roomId: string;
		blockerId: string;
		targetPseudonym: string;
		now?: Date;
	}): Promise<{ blockedPseudonym: string; created: boolean; changed: boolean }>;
	unblockRoomMember(input: {
		roomId: string;
		blockerId: string;
		targetPseudonym: string;
		now?: Date;
	}): Promise<{ blockedPseudonym: string; changed: boolean }>;
	createSafetyReport(input: {
		roomId: string;
		reporterId: string;
		request: SafetyReportCreateRequest;
		createdAt?: Date;
	}): Promise<{ report: { id: string; status: SafetyReportStatus }; created: boolean }>;
}

function mapQueryError(error: unknown): never {
	if (!(error instanceof SafetyQueryError)) throw error;
	if (error.code === "ROOM_ACCESS_DENIED") {
		throw new SafetyServiceError("room_access_denied", 403, "Nie należysz do tego pokoju.");
	}
	throw new SafetyServiceError(
		"safety_target_invalid",
		400,
		"Nie można wykonać tej operacji dla wskazanej osoby ani wiadomości.",
	);
}

export function createSafetyService(dependencies: SafetyServiceDependencies) {
	return {
		async getRulesStatus(userId: string): Promise<CommunityRulesStatusResponse> {
			return CommunityRulesStatusResponseSchema.parse({
				version: dependencies.rulesVersion,
				accepted: await dependencies.hasCommunityRulesAcceptance(userId, dependencies.rulesVersion),
				topics: COMMUNITY_RULES_TOPICS,
			});
		},

		async acceptRules(
			userId: string,
			rawRequest: CommunityRulesAcceptanceRequest,
		): Promise<CommunityRulesAcceptanceResponse> {
			const parsed = CommunityRulesAcceptanceRequestSchema.safeParse(rawRequest);
			if (!parsed.success) {
				throw new SafetyServiceError(
					"safety_request_invalid",
					400,
					"Nieprawidłowa wersja zasad społeczności.",
				);
			}
			if (parsed.data.version !== dependencies.rulesVersion) {
				throw new SafetyServiceError(
					"rules_version_outdated",
					409,
					"Zasady społeczności zmieniły się. Przeczytaj i zaakceptuj aktualną wersję.",
				);
			}
			const result = await dependencies.acceptCommunityRules({
				userId,
				rulesVersion: dependencies.rulesVersion,
				acceptedAt: dependencies.now(),
			});
			return CommunityRulesAcceptanceResponseSchema.parse({
				version: result.acceptance.rulesVersion,
				acceptedAt: result.acceptance.acceptedAt.toISOString(),
				created: result.created,
			});
		},

		async listBlocks(userId: string, roomId: string) {
			try {
				return {
					blockedPseudonyms: await dependencies.listBlockedMemberPseudonyms(roomId, userId),
				};
			} catch (error) {
				return mapQueryError(error);
			}
		},

		async block(
			userId: string,
			roomId: string,
			rawRequest: RoomBlockRequest,
		): Promise<RoomBlockResponse> {
			const parsed = RoomBlockRequestSchema.safeParse(rawRequest);
			if (!parsed.success) {
				throw new SafetyServiceError(
					"safety_request_invalid",
					400,
					"Wskaż prawidłowy pseudonim do zablokowania.",
				);
			}
			try {
				const result = await dependencies.blockRoomMember({
					roomId,
					blockerId: userId,
					targetPseudonym: parsed.data.targetPseudonym,
					now: dependencies.now(),
				});
				return RoomBlockResponseSchema.parse({
					blockedPseudonym: result.blockedPseudonym,
					active: true,
					changed: result.changed,
				});
			} catch (error) {
				return mapQueryError(error);
			}
		},

		async unblock(userId: string, roomId: string, targetPseudonym: string) {
			try {
				const result = await dependencies.unblockRoomMember({
					roomId,
					blockerId: userId,
					targetPseudonym,
					now: dependencies.now(),
				});
				return RoomBlockResponseSchema.parse({ ...result, active: false });
			} catch (error) {
				return mapQueryError(error);
			}
		},

		async report(
			userId: string,
			roomId: string,
			rawRequest: SafetyReportCreateRequest,
		): Promise<SafetyReportCreateResponse> {
			const parsed = SafetyReportCreateRequestSchema.safeParse(rawRequest);
			if (!parsed.success) {
				throw new SafetyServiceError(
					"safety_request_invalid",
					400,
					"Sprawdź cel, powód i notatkę zgłoszenia.",
				);
			}
			try {
				const result = await dependencies.createSafetyReport({
					roomId,
					reporterId: userId,
					request: parsed.data,
					createdAt: dependencies.now(),
				});
				return SafetyReportCreateResponseSchema.parse({
					reportId: result.report.id,
					status: result.report.status,
					created: result.created,
				});
			} catch (error) {
				return mapQueryError(error);
			}
		},
	};
}

export type SafetyService = ReturnType<typeof createSafetyService>;
