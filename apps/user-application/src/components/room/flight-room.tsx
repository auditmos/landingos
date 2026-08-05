import {
	type PublicRoomMember,
	type PublicRoomMessage,
	RoomMessageCreateRequestSchema,
	RoomRealtimeErrorSchema,
	type RoomRealtimeEvent,
	RoomRealtimeEventSchema,
	type RoomSelection,
	type RoomSnapshot,
} from "@repo/data-ops/room";
import { Bus, Car, MessageCircle, RefreshCw, Send } from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearPrivateDropOff } from "@/lib/private-drop-off";
import {
	fetchRoomSnapshot,
	issueRoomTicket,
	joinRoom,
	roomWebSocketUrl,
	sendRoomMessage,
	updateRoomSelection,
} from "@/lib/room-api";
import { clearRoomIntent, loadRoomIntent, type RoomIntent } from "@/lib/room-intent";
import { cn } from "@/lib/utils";
import { ClosedRoom } from "./closed-room";
import { DropOffPanel } from "./drop-off-panel";
import { PseudonymSetup } from "./pseudonym-setup";
import { pseudonymColor, pseudonymInitials } from "./pseudonym-visuals";
import {
	CommunityRulesDisclosure,
	CommunityRulesGate,
	ReportForm,
	RoomMembers,
	SafetyNotices,
} from "./room-safety-panel";
import { useRoomSafety } from "./use-room-safety";

function upsertMember(members: PublicRoomMember[], member: PublicRoomMember): PublicRoomMember[] {
	const index = members.findIndex((candidate) => candidate.pseudonym === member.pseudonym);
	if (index < 0) return [...members, member];
	return members.map((candidate, candidateIndex) =>
		candidateIndex === index ? member : candidate,
	);
}

function upsertMessage(
	messages: PublicRoomMessage[],
	message: PublicRoomMessage,
): PublicRoomMessage[] {
	return messages.some((candidate) => candidate.id === message.id)
		? messages
		: [...messages, message];
}

type SnapshotSetter = Dispatch<SetStateAction<RoomSnapshot | null>>;

async function initializeRoom(intent: RoomIntent): Promise<RoomSnapshot> {
	const joined = await joinRoom(intent.flightInstanceId);
	await updateRoomSelection(joined.room.id, intent.selection);
	return fetchRoomSnapshot(joined.room.id);
}

type RoomSocketHandlers = {
	open: () => void;
	message: (event: MessageEvent) => void;
	close: (event: CloseEvent) => void;
};

async function openRoomConnection(
	roomId: string,
	recoverHistory: boolean,
	handlers: RoomSocketHandlers,
) {
	const recovered = recoverHistory ? await fetchRoomSnapshot(roomId) : undefined;
	const ticket = await issueRoomTicket(roomId);
	const socket = new WebSocket(roomWebSocketUrl(roomId, ticket.ticket));
	socket.addEventListener("open", handlers.open);
	socket.addEventListener("message", handlers.message);
	socket.addEventListener("close", handlers.close);
	return { recovered, socket };
}

function applyRealtimeEvent(setSnapshot: SnapshotSetter, event: RoomRealtimeEvent) {
	if (event.type === "room_redacted") return;
	setSnapshot((current) => {
		if (!current) return current;
		if (event.type === "message_created") {
			return {
				...current,
				messages: upsertMessage(current.messages, event.message),
			};
		}
		return {
			...current,
			members: upsertMember(current.members, event.member),
		};
	});
}

function handleRealtimePayload(
	rawData: string,
	setSnapshot: SnapshotSetter,
	setError: Dispatch<SetStateAction<string>>,
) {
	try {
		const value: unknown = JSON.parse(rawData);
		const event = RoomRealtimeEventSchema.safeParse(value);
		if (event.success) {
			applyRealtimeEvent(setSnapshot, event.data);
			return;
		}
		const realtimeError = RoomRealtimeErrorSchema.safeParse(value);
		if (realtimeError.success) setError(realtimeError.data.error);
	} catch {
		setError("Odebrano nieprawidłowe zdarzenie pokoju.");
	}
}

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

function formatMessageTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

function ChatMessageItem({
	message,
	own,
	onReport,
}: {
	message: PublicRoomMessage;
	own: boolean;
	onReport: () => void;
}) {
	return (
		<div className={cn("flex items-end gap-2", own && "flex-row-reverse")}>
			{own ? null : (
				<Avatar className="size-8 shrink-0">
					<AvatarFallback
						className={cn("text-xs font-semibold text-white", pseudonymColor(message.pseudonym))}
					>
						{pseudonymInitials(message.pseudonym)}
					</AvatarFallback>
				</Avatar>
			)}
			<div
				className={cn(
					"max-w-[78%] rounded-2xl px-3 py-2",
					own
						? "rounded-br-sm bg-primary text-primary-foreground"
						: "rounded-bl-sm bg-muted text-foreground",
				)}
			>
				{own ? null : <p className="text-xs font-semibold">{message.pseudonym}</p>}
				<p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
				<div className={cn("mt-1 flex", own ? "justify-end" : "justify-start")}>
					<span
						className={cn(
							"text-[10px]",
							own ? "text-primary-foreground/70" : "text-muted-foreground",
						)}
					>
						{formatMessageTime(message.createdAt)}
					</span>
				</div>
				{own ? null : (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="mt-1 h-7 px-2 text-xs"
						onClick={onReport}
					>
						Zgłoś wiadomość
					</Button>
				)}
			</div>
		</div>
	);
}

function SelectionPanel({
	selectedKind,
	intent,
	onChange,
}: {
	selectedKind: RoomSelection["kind"] | undefined;
	intent: RoomIntent | null;
	onChange: (selection: RoomSelection) => void;
}) {
	const publicOption =
		intent?.selection.kind === "public_transport"
			? intent.selection
			: (intent?.publicOption ?? null);
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">Twoja deklaracja</CardTitle>
				<CardDescription>Możesz zmienić ją w dowolnym momencie.</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-2">
				<Button
					type="button"
					className="justify-start"
					variant={selectedKind === "public_transport" ? "default" : "outline"}
					disabled={!publicOption}
					onClick={() => publicOption && onChange(publicOption)}
				>
					<Bus className="size-4" />
					Transport publiczny
				</Button>
				<Button
					type="button"
					className="justify-start"
					variant={selectedKind === "shared_taxi" ? "default" : "outline"}
					onClick={() => onChange({ kind: "shared_taxi" })}
				>
					<Car className="size-4" />
					Dzielona taksówka
				</Button>
			</CardContent>
		</Card>
	);
}

export function FlightRoom() {
	const [intent, setIntent] = useState<RoomIntent | null>(null);
	const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);
	const [needsPseudonym, setNeedsPseudonym] = useState(false);
	const [retryKey, setRetryKey] = useState(0);
	const [connection, setConnection] = useState("Łączenie…");
	const [closed, setClosed] = useState(false);
	const messagesRef = useRef<HTMLDivElement>(null);
	const closeRoomView = useCallback(() => {
		clearRoomIntent();
		clearPrivateDropOff();
		setSnapshot(null);
		setClosed(true);
		setConnection("Pokój zamknięty");
		setError("");
	}, []);
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
		const nextIntent = loadRoomIntent();
		setIntent(nextIntent);
		if (!nextIntent) {
			setError("Najpierw wybierz lot i wariant przejazdu w planerze.");
			setLoading(false);
			return () => {
				active = false;
			};
		}
		setLoading(true);
		setError("");
		setNeedsPseudonym(false);
		void initializeRoom(nextIntent)
			.then((refreshed) => {
				if (active) setSnapshot(refreshed);
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
	}, [retryKey, closeRoomView]);

	useEffect(() => {
		const closesAt = snapshot?.room.closesAt;
		if (!closesAt) return;
		let timer: ReturnType<typeof setTimeout>;
		const schedule = () => {
			const remaining = new Date(closesAt).getTime() - Date.now();
			if (remaining <= 0) {
				closeRoomView();
				return;
			}
			timer = setTimeout(
				remaining > 2_147_000_000 ? schedule : closeRoomView,
				Math.min(remaining, 2_147_000_000),
			);
		};
		schedule();
		return () => clearTimeout(timer);
	}, [snapshot?.room.closesAt, closeRoomView]);

	useEffect(() => {
		const roomId = snapshot?.room.id;
		if (!roomId) return;
		const activeRoomId = roomId;
		let active = true;
		let socket: WebSocket | undefined;
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

		function handleOpen() {
			if (active) setConnection("Połączono");
		}

		function handleMessage(raw: MessageEvent) {
			if (!active || typeof raw.data !== "string") return;
			try {
				const parsed = RoomRealtimeEventSchema.safeParse(JSON.parse(raw.data));
				if (parsed.success && parsed.data.type === "room_redacted") {
					void fetchRoomSnapshot(activeRoomId).then(setSnapshot).catch(closeRoomView);
					return;
				}
			} catch {
				// The shared payload parser below renders the Polish validation error.
			}
			handleRealtimePayload(raw.data, setSnapshot, setError);
		}

		function handleClose(event: CloseEvent) {
			if (!active) return;
			if (event.code === 4001) {
				closeRoomView();
				return;
			}
			setConnection("Przywracanie połączenia…");
			reconnectTimer = setTimeout(() => void connect(true), 1_000);
		}

		function connect(recoverHistory: boolean) {
			void openRoomConnection(activeRoomId, recoverHistory, {
				open: handleOpen,
				message: handleMessage,
				close: handleClose,
			})
				.then((prepared) => {
					if (!active) {
						prepared.socket.close(1000, "Widok został zamknięty");
						return;
					}
					if (prepared.recovered) setSnapshot(prepared.recovered);
					socket = prepared.socket;
				})
				.catch((caught: unknown) => {
					if (!active) return;
					setConnection("Połączenie przerwane");
					setError(caught instanceof Error ? caught.message : "Nie udało się połączyć z pokojem.");
				});
		}

		connect(false);
		return () => {
			active = false;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			socket?.close(1000, "Zmiana widoku");
		};
	}, [snapshot?.room.id, closeRoomView]);

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
					<Badge variant="secondary">{connection}</Badge>
				</div>

				{!snapshot ? (
					<Button asChild>
						<a href="/">Wróć do planera</a>
					</Button>
				) : (
					<>
						<div className="grid gap-4 sm:grid-cols-2">
							<SelectionPanel
								selectedKind={snapshot.member.selection?.kind}
								intent={intent}
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
