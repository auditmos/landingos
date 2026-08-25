import {
	type PastFlightListing,
	type PublicTransportSelection,
	RoomMessageCreateRequestSchema,
	type RoomSelection,
	type RoomSnapshot,
} from "@repo/data-ops/room";
import { MessageCircle, RefreshCw, Send } from "lucide-react";
import {
	type Dispatch,
	type FormEvent,
	type SetStateAction,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearPrivateDropOff } from "@/lib/private-drop-off";
import { fetchRoomSnapshot, sendRoomMessage, updateRoomSelection } from "@/lib/room-api";
import { clearRoomIntent } from "@/lib/room-intent";
import { useRefreshOpenRoomCount } from "@/lib/use-my-rooms";
import { cn } from "@/lib/utils";
import { ClosedRoom } from "./closed-room";
import { DropOffPanel } from "./drop-off-panel";
import { RoomGateway } from "./my-flights-list";
import { PseudonymSetup } from "./pseudonym-setup";
import { useRoomExpiry, useRoomSocket } from "./room-connection";
import { resolveRoomEntry, upsertMember, upsertMessage } from "./room-entry";
import { ChatMessageItem, SelectionPanel } from "./room-panels";
import {
	CommunityRulesDisclosure,
	CommunityRulesGate,
	ReportForm,
	RoomMembers,
	SafetyNotices,
} from "./room-safety-panel";
import { useRoomSafety } from "./use-room-safety";

/**
 * The one phase the room view can be in. Every phase carries exactly the data
 * it renders, so a transition is a single assignment and a write that lands
 * after the view moved on (a refetch resolving past a close) is a structural
 * no-op instead of a hazard masked by render order.
 */
type RoomView =
	| { kind: "loading" }
	| { kind: "closed" }
	| { kind: "needs_pseudonym" }
	| { kind: "planner_required"; pastFlights: PastFlightListing[] }
	| { kind: "entry_failed"; message: string }
	| { kind: "room"; snapshot: RoomSnapshot; publicOption: PublicTransportSelection | null };

function viewFromInitializationError(caught: unknown): RoomView {
	if (caught instanceof Error && caught.name === "PSEUDONYM_REQUIRED") {
		return { kind: "needs_pseudonym" };
	}
	if (caught instanceof Error && caught.name === "room_closed") return { kind: "closed" };
	return {
		kind: "entry_failed",
		message: caught instanceof Error ? caught.message : "Nie udało się wejść do pokoju.",
	};
}

/**
 * Snapshot writes, both shapes, routed through the phase. `updateSnapshot` is
 * what this component uses; `setSnapshot` keeps the existing
 * `Dispatch<SetStateAction<RoomSnapshot | null>>` contract the socket and
 * safety hooks are typed against. Outside the room phase there is no snapshot
 * to update, so a write that lands after the view moved on is a no-op.
 */
function useSnapshotWriters(setView: Dispatch<SetStateAction<RoomView>>) {
	const updateSnapshot = useCallback(
		(apply: (snapshot: RoomSnapshot) => RoomSnapshot) => {
			setView((current) =>
				current.kind === "room" ? { ...current, snapshot: apply(current.snapshot) } : current,
			);
		},
		[setView],
	);
	const setSnapshot = useCallback<Dispatch<SetStateAction<RoomSnapshot | null>>>(
		(update) => {
			updateSnapshot((current) => {
				const next = typeof update === "function" ? update(current) : update;
				return next ?? current;
			});
		},
		[updateSnapshot],
	);
	return { updateSnapshot, setSnapshot };
}

/** The phases that replace the room shell instead of rendering inside it. */
function standalonePhase(view: RoomView, onPseudonymSaved: () => void) {
	switch (view.kind) {
		case "closed":
			return <ClosedRoom />;
		case "loading":
			return <p aria-live="polite">Przygotowujemy pokój lotu…</p>;
		case "needs_pseudonym":
			return <PseudonymSetup onSaved={onPseudonymSaved} />;
		default:
			return null;
	}
}

/** Flattens the phase into what the room shell renders, once, in one place. */
function presentRoomView(view: RoomView) {
	switch (view.kind) {
		case "room":
			return {
				snapshot: view.snapshot,
				publicOption: view.publicOption,
				pastFlights: [] as PastFlightListing[],
				plannerPrompt: false,
				entryFailure: "",
			};
		case "planner_required":
			return {
				snapshot: null,
				publicOption: null,
				pastFlights: view.pastFlights,
				plannerPrompt: true,
				entryFailure: "",
			};
		case "entry_failed":
			return {
				snapshot: null,
				publicOption: null,
				pastFlights: [] as PastFlightListing[],
				plannerPrompt: false,
				entryFailure: view.message,
			};
		default:
			return {
				snapshot: null,
				publicOption: null,
				pastFlights: [] as PastFlightListing[],
				plannerPrompt: false,
				entryFailure: "",
			};
	}
}

export function FlightRoom({ roomId }: { roomId?: string }) {
	const [view, setView] = useState<RoomView>({ kind: "loading" });
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [retryKey, setRetryKey] = useState(0);
	const [connection, setConnection] = useState("Łączenie…");
	const messagesRef = useRef<HTMLDivElement>(null);
	const refreshOpenRoomCount = useRefreshOpenRoomCount();
	const { snapshot, publicOption, pastFlights, plannerPrompt, entryFailure } =
		presentRoomView(view);
	const { updateSnapshot, setSnapshot } = useSnapshotWriters(setView);

	const closeRoomView = useCallback(() => {
		clearRoomIntent();
		clearPrivateDropOff();
		refreshOpenRoomCount();
		setView({ kind: "closed" });
	}, [refreshOpenRoomCount]);

	const safety = useRoomSafety(snapshot?.room.id, async () => {
		const openRoomId = snapshot?.room.id;
		if (openRoomId) setSnapshot(await fetchRoomSnapshot(openRoomId));
	});

	useEffect(() => {
		const container = messagesRef.current;
		const count = snapshot?.messages.length ?? 0;
		if (container && count > 0) container.scrollTop = container.scrollHeight;
	}, [snapshot?.messages.length]);

	useEffect(() => {
		void retryKey;
		let active = true;
		setView({ kind: "loading" });
		setError("");
		resolveRoomEntry(roomId)
			.then((entry) => {
				if (!active) return;
				if (entry.kind === "planner_required") {
					setView({ kind: "planner_required", pastFlights: entry.pastFlights });
					return;
				}
				if (entry.kind === "flight_choice") {
					window.location.assign("/app/flights");
					return;
				}
				setView({ kind: "room", snapshot: entry.snapshot, publicOption: entry.publicOption });
				refreshOpenRoomCount();
			})
			.catch((caught: unknown) => {
				if (!active) return;
				const next = viewFromInitializationError(caught);
				if (next.kind === "closed") closeRoomView();
				else setView(next);
			});
		return () => {
			active = false;
		};
	}, [retryKey, roomId, closeRoomView, refreshOpenRoomCount]);

	useRoomExpiry(snapshot?.room.closesAt, closeRoomView);

	useRoomSocket(snapshot?.room.id, { setSnapshot, setError, setConnection, closeRoomView });

	async function changeSelection(selection: RoomSelection) {
		if (!snapshot) return;
		setError("");
		try {
			const member = await updateRoomSelection(snapshot.room.id, selection);
			updateSnapshot((current) => ({
				...current,
				member,
				members: upsertMember(current.members, member),
			}));
		} catch (caught) {
			if (caught instanceof Error && caught.name === "room_closed") {
				closeRoomView();
				return;
			}
			setError(caught instanceof Error ? caught.message : "Nie udało się zmienić deklaracji.");
		}
	}

	async function submitMessage(event: FormEvent) {
		event.preventDefault();
		if (!snapshot) return;
		const parsed = RoomMessageCreateRequestSchema.safeParse({
			clientMessageId: crypto.randomUUID(),
			content: message,
		});
		if (!parsed.success) {
			setError(parsed.error.issues[0]?.message ?? "Sprawdź treść wiadomości.");
			return;
		}
		setError("");
		try {
			const result = await sendRoomMessage(snapshot.room.id, parsed.data);
			updateSnapshot((current) => ({
				...current,
				messages: upsertMessage(current.messages, result.message),
			}));
			setMessage("");
		} catch (caught) {
			if (caught instanceof Error && caught.name === "room_closed") {
				closeRoomView();
				return;
			}
			setError(caught instanceof Error ? caught.message : "Nie udało się wysłać wiadomości.");
		}
	}

	const standalone = standalonePhase(view, () => setRetryKey((value) => value + 1));
	if (standalone) return standalone;

	const gated = !!snapshot && !!safety.rules && !safety.rules.accepted;
	const failure = entryFailure || error;

	return (
		<section className="mx-auto max-w-3xl space-y-5">
			{snapshot ? <CommunityRulesGate safety={safety} /> : null}

			{plannerPrompt ? (
				<Alert>
					<AlertDescription>Najpierw wybierz lot i wariant przejazdu w planerze.</AlertDescription>
				</Alert>
			) : null}

			{failure ? (
				<Alert variant="destructive">
					<AlertTitle>Nie udało się wykonać operacji</AlertTitle>
					<AlertDescription>{failure}</AlertDescription>
				</Alert>
			) : null}

			<SafetyNotices safety={safety} />
			{snapshot ? <ReportForm safety={safety} /> : null}

			<div
				className={cn(
					"space-y-5 transition-opacity",
					gated && "pointer-events-none select-none opacity-40 blur-[1px]",
				)}
				inert={gated || undefined}
			>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Pokój lotu</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							LandingOS nie sprawdza karty pokładowej. Do pokoju wchodzą osoby deklarujące ten sam
							lot.
						</p>
					</div>
					{snapshot ? <Badge variant="secondary">{connection}</Badge> : null}
				</div>

				{!snapshot ? (
					<RoomGateway pastFlights={pastFlights} />
				) : (
					<>
						<div className="grid gap-4 sm:grid-cols-2">
							<SelectionPanel
								selectedKind={snapshot.member.selection?.kind}
								publicOption={publicOption}
								onChange={(selection) =>
									changeSelection(
										snapshot.member.selection?.dropOffText
											? { ...selection, dropOffText: snapshot.member.selection.dropOffText }
											: selection,
									)
								}
							/>

							<RoomMembers
								members={snapshot.members}
								currentPseudonym={snapshot.member.pseudonym}
								safety={safety}
							/>
						</div>

						<DropOffPanel
							flightInstanceId={snapshot.room.flightInstanceId}
							sharedDropOff={snapshot.member.selection?.dropOffText}
							canShare={!!snapshot.member.selection}
							onShare={(label) => {
								const selection = snapshot.member.selection;
								if (selection) void changeSelection({ ...selection, dropOffText: label });
							}}
							onUnshare={() => {
								const selection = snapshot.member.selection;
								if (!selection) return;
								const { dropOffText: _shared, ...rest } = selection;
								void changeSelection(rest);
							}}
						/>

						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2 text-xl">
									<MessageCircle className="size-5" />
									Wspólny czat
								</CardTitle>
								<CardDescription>Jedna rozmowa dla osób z tego lotu.</CardDescription>
							</CardHeader>
							<CardContent className="space-y-4">
								<div
									ref={messagesRef}
									className="max-h-[55vh] min-h-40 space-y-3 overflow-y-auto pr-1"
									aria-live="polite"
								>
									{snapshot.messages.length === 0 ? (
										<p className="text-sm text-muted-foreground">Nie ma jeszcze wiadomości.</p>
									) : (
										snapshot.messages.map((item) => (
											<ChatMessageItem
												key={item.id}
												message={item}
												own={item.pseudonym === snapshot.member.pseudonym}
												onReport={(origin) => safety.startMessageReport(item, origin)}
												reportResult={safety.messageReportResult(item.id)}
											/>
										))
									)}
								</div>
								<form className="space-y-2" onSubmit={submitMessage}>
									<label className="text-sm font-medium" htmlFor="room-message">
										Wiadomość
									</label>
									<div className="flex items-end gap-2">
										<Input
											id="room-message"
											value={message}
											onChange={(event) => setMessage(event.target.value)}
											autoComplete="off"
										/>
										<Button
											type="submit"
											disabled={
												!safety.rules?.accepted ||
												Array.from(message.trim()).length < 1 ||
												Array.from(message.trim()).length > 1_000
											}
										>
											<Send className="size-4" />
											Wyślij
										</Button>
									</div>
									<span className="text-xs text-muted-foreground">
										{Array.from(message.trim()).length}/1000
									</span>
								</form>
							</CardContent>
						</Card>

						<div className="flex flex-wrap items-center justify-between gap-2">
							<CommunityRulesDisclosure safety={safety} />
							<Button
								type="button"
								variant="ghost"
								onClick={() => void fetchRoomSnapshot(snapshot.room.id).then(setSnapshot)}
							>
								<RefreshCw className="size-4" />
								Odśwież historię
							</Button>
						</div>
					</>
				)}
			</div>
		</section>
	);
}
