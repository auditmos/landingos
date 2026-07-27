import { getDb } from "@repo/data-ops/database/setup";
import {
	acceptCommunityRules,
	blockRoomMember,
	COMMUNITY_RULES_VERSION,
	createSafetyReport,
	hasCommunityRulesAcceptance,
	listBlockedMemberPseudonyms,
	unblockRoomMember,
} from "@repo/data-ops/safety";
import { createSafetyService, type SafetyService } from "./service";

export function createDatabaseSafetyService(): SafetyService {
	const db = getDb();
	return createSafetyService({
		now: () => new Date(),
		rulesVersion: COMMUNITY_RULES_VERSION,
		hasCommunityRulesAcceptance: (userId, rulesVersion) =>
			hasCommunityRulesAcceptance(db, userId, rulesVersion),
		acceptCommunityRules: (input) => acceptCommunityRules(db, input),
		listBlockedMemberPseudonyms: (roomId, blockerId) =>
			listBlockedMemberPseudonyms(db, roomId, blockerId),
		blockRoomMember: (input) => blockRoomMember(db, input),
		unblockRoomMember: (input) => unblockRoomMember(db, input),
		createSafetyReport: (input) => createSafetyReport(db, input),
	});
}
