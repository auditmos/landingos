import {
	type CommunityRulesStatusResponse,
	SafetyReportNoteSchema,
	type SafetyReportReason,
} from "@repo/data-ops/safety";
import { useEffect, useRef, useState } from "react";
import {
	acceptCommunityRules,
	blockRoomMember,
	fetchBlockedMembers,
	fetchCommunityRules,
	reportRoomSafety,
	unblockRoomMember,
} from "@/lib/safety-api";

type RoomReportTarget =
	| { targetType: "member"; targetPseudonym: string }
	| { targetType: "message"; messageId: string };

export interface RoomSafetyController {
	rules: CommunityRulesStatusResponse | null;
	blockedPseudonyms: string[];
	reportTarget: RoomReportTarget | null;
	reportReason: SafetyReportReason;
	reportNote: string;
	pending: boolean;
	error: string;
	notice: string;
	acceptRules(): Promise<void>;
	block(pseudonym: string): Promise<void>;
	unblock(pseudonym: string): Promise<void>;
	startMemberReport(pseudonym: string): void;
	startMessageReport(messageId: string): void;
	cancelReport(): void;
	setReportReason(reason: SafetyReportReason): void;
	setReportNote(note: string): void;
	submitReport(): Promise<void>;
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : "Nie udało się wykonać operacji bezpieczeństwa.";
}

export function useRoomSafety(
	roomId: string | undefined,
	onVisibilityChange?: () => Promise<void>,
): RoomSafetyController {
	const [rules, setRules] = useState<CommunityRulesStatusResponse | null>(null);
	const [blockedPseudonyms, setBlockedPseudonyms] = useState<string[]>([]);
	const [reportTarget, setReportTarget] = useState<RoomReportTarget | null>(null);
	const [reportReason, setReportReason] = useState<SafetyReportReason>("other");
	const [reportNote, setReportNote] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const visibilityChangeRef = useRef(onVisibilityChange);
	visibilityChangeRef.current = onVisibilityChange;

	useEffect(() => {
		let active = true;
		setError("");
		setNotice("");
		if (!roomId) {
			setRules(null);
			setBlockedPseudonyms([]);
			return () => {
				active = false;
			};
		}
		void Promise.all([fetchCommunityRules(), fetchBlockedMembers(roomId)])
			.then(([nextRules, nextBlocks]) => {
				if (!active) return;
				setRules(nextRules);
				setBlockedPseudonyms(nextBlocks.blockedPseudonyms);
			})
			.catch((caught: unknown) => {
				if (active) setError(errorMessage(caught));
			});
		return () => {
			active = false;
		};
	}, [roomId]);

	async function run(action: () => Promise<void>) {
		setPending(true);
		setError("");
		setNotice("");
		try {
			await action();
		} catch (caught) {
			setError(errorMessage(caught));
		} finally {
			setPending(false);
		}
	}

	async function acceptRules() {
		if (!rules) return;
		await run(async () => {
			await acceptCommunityRules(rules.version);
			setRules({ ...rules, accepted: true });
			setNotice("Zasady społeczności zostały zaakceptowane.");
		});
	}

	async function block(pseudonym: string) {
		if (!roomId) return;
		await run(async () => {
			await blockRoomMember(roomId, pseudonym);
			setBlockedPseudonyms((current) =>
				current.includes(pseudonym) ? current : [...current, pseudonym],
			);
			await visibilityChangeRef.current?.();
			setNotice("Ta osoba została zablokowana. Jej wiadomości są ukryte.");
		});
	}

	async function unblock(pseudonym: string) {
		if (!roomId) return;
		await run(async () => {
			await unblockRoomMember(roomId, pseudonym);
			setBlockedPseudonyms((current) => current.filter((item) => item !== pseudonym));
			await visibilityChangeRef.current?.();
			setNotice("Ta osoba została odblokowana. Zobaczysz tylko przyszłe wiadomości.");
		});
	}

	function cancelReport() {
		setReportTarget(null);
		setReportNote("");
		setReportReason("other");
	}

	async function submitReport() {
		if (!roomId || !reportTarget) return;
		const parsedNote = SafetyReportNoteSchema.safeParse(reportNote);
		if (!parsedNote.success) {
			setError(parsedNote.error.issues[0]?.message ?? "Sprawdź długość notatki.");
			return;
		}
		await run(async () => {
			await reportRoomSafety(roomId, {
				...reportTarget,
				reason: reportReason,
				...(parsedNote.data ? { note: parsedNote.data } : {}),
			});
			cancelReport();
			setNotice("Zgłoszenie zostało zapisane.");
		});
	}

	return {
		rules,
		blockedPseudonyms,
		reportTarget,
		reportReason,
		reportNote,
		pending,
		error,
		notice,
		acceptRules,
		block,
		unblock,
		startMemberReport: (targetPseudonym) =>
			setReportTarget({ targetType: "member", targetPseudonym }),
		startMessageReport: (messageId) => setReportTarget({ targetType: "message", messageId }),
		cancelReport,
		setReportReason,
		setReportNote,
		submitReport,
	};
}
