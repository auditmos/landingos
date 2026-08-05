import {
	type PastFlightListing,
	type PublicTransportSelection,
	type RoomListing,
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
import { enterListedRoom, resolveRoomEntry, upsertMember, upsertMessage } from "./room-entry";
import { ChatMessageItem, RoomStatusBar, SelectionPanel } from "./room-panels";
import {
	CommunityRulesDisclosure,
	CommunityRulesGate,
	ReportForm,
	RoomMembers,
	SafetyNotices,
} from "./room-safety-panel";
import { useRoomSafety } from "./use-room-safety";

function handleInitializationError(
	caught: unknown,
	setNeedsPseudonym: Dispatch<SetStateAction<boolean>>,
	setError: Dispatch<SetStateAction<string>>,
	closeRoomView: () => void,
) {
	if (caught instanceof Error && caught.name === "PSEUDONYM_REQUIRED") {
		setNeedsPseudonym(true);
	} else if (caught instanceof Error && caught.name === "room_closed") {
		closeRoomView();
	} else {
		setError(caught instanceof Error ? caught.message : "Nie udało się wejść do pokoju.");
	}
}

export function FlightRoom() {
	const [publicOption, setPublicOption] = useState<PublicTransportSelection | null>(null);
	const [flightChoices, setFlightChoices] = useState<RoomListing[] | null>(null);
	const [pastFlights, setPastFlights] = useState<PastFlightListing[]>([]);
	const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);
	const [needsPseudonym, setNeedsPseudonym] = useState(false);
	const [retryKey, setRetryKey] = useState(0);
	const [connection, setConnection] = useState("Łączenie…");
	const [closed, setClosed] = useState(false);
	const messagesRef = useRef<HTMLDivElement>(null);
	const refreshOpenRoomCount = useRefreshOpenRoomCount();
	const closeRoomView = useCallback(() => {
		clearRoomIntent();
		clearPrivateDropOff();
		setSnapshot(null);
		setClosed(true);
		setConnection("Pokój zamknięty");
		setError("");
		refreshOpenRoomCount();
	}, [refreshOpenRoomCount]);
	const safety = useRoomSafety(snapshot?.room.id, async () => {
		const roomId = snapshot?.room.id;
		if (roomId) setSnapshot(await fetchRoomSnapshot(roomId));
	});

	useEffect(() => {
		const container = messagesRef.current;
		const count = snapshot?.messages.length ?? 0;
		if (container && count > 0) container.scrollTop = container.scrollHeight;
	}, [snapshot?.messages.length]);

	useEffect(() => {
		void retryKey;
		let active = true;
		setLoading(true);
		setError("");
		setNeedsPseudonym(false);
		resolveRoomEntry()
			.then((entry) => {
				if (!active) return;
				if (entry.kind === "planner_required") {
					setPastFlights(entry.pastFlights);
					setError("Najpierw wybierz lot i wariant przejazdu w planerze.");
					return;
				}
				if (entry.kind === "flight_choice") {
					setFlightChoices(entry.rooms);
					return;
				}
				setFlightChoices(entry.rooms.length > 1 ? entry.rooms : null);
				setPublicOption(entry.publicOption);
				setSnapshot(entry.snapshot);
				refreshOpenRoomCount();
			})
			.catch((caught: unknown) => {
				if (!active) return;
				handleInitializationError(caught, setNeedsPseudonym, setError, closeRoomView);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [retryKey, closeRoomView, refreshOpenRoomCount]);

	useRoomExpiry(snapshot?.room.closesAt, closeRoomView);

	useRoomSocket(snapshot?.room.id, { setSnapshot, setError, setConnection, closeRoomView });

	async function enterChosenRoom(roomId: string) {
		setError("");
		setConnection("Łączenie…");
		try {
			const entered = await enterListedRoom(roomId);
			setPublicOption(entered.publicOption);
			setSnapshot(entered.snapshot);
		} catch (caught) {
			handleInitializationError(caught, setNeedsPseudonym, setError, closeRoomView);
		}
	}

	async function changeSelection(selection: RoomSelection) {
		if (!snapshot) return;
		setError("");
		try {
			const member = await updateRoomSelection(snapshot.room.id, selection);
			setSnapshot((current) =>
				current
					? {
							...current,
							member,
							members: upsertMember(current.members, member),
						}
					: current,
			);
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
			setSnapshot((current) =>
				current
					? { ...current, messages: upsertMessage(current.messages, result.message) }
					: current,
			);
			setMessage("");
		} catch (caught) {
			if (caught instanceof Error && caught.name === "room_closed") {
				closeRoomView();
				return;
			}
			setError(caught instanceof Error ? caught.message : "Nie udało się wysłać wiadomości.");
		}
	}

	if (closed) return <ClosedRoom />;
	if (loading) return <p aria-live="polite">Przygotowujemy pokój lotu…</p>;
	if (needsPseudonym) return <PseudonymSetup onSaved={() => setRetryKey((value) => value + 1)} />;

	const gated = !!snapshot && !!safety.rules && !safety.rules.accepted;

	return (
		<section className="mx-auto max-w-3xl space-y-5">
			{snapshot ? <CommunityRulesGate safety={safety} /> : null}

			{error ? (
				<Alert variant="destructive">
					<AlertTitle>Nie udało się wykonać operacji</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
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
					{snapshot ? (
						<RoomStatusBar
							connection={connection}
							showFlights={(flightChoices?.length ?? 0) > 1}
							onShowFlights={() => {
								setSnapshot(null);
								setConnection("Łączenie…");
							}}
						/>
					) : null}
				</div>

				{!snapshot ? (
					<RoomGateway
						rooms={flightChoices}
						pastFlights={pastFlights}
						onSelect={(roomId) => void enterChosenRoom(roomId)}
					/>
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
												onReport={() => safety.startMessageReport(item.id)}
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
