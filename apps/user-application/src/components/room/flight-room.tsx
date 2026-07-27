import { PseudonymSchema } from "@repo/data-ops/identity";
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
import { MessageCircle, RefreshCw, Send } from "lucide-react";
import { type Dispatch, type FormEvent, type SetStateAction, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	fetchRoomSnapshot,
	issueRoomTicket,
	joinRoom,
	roomWebSocketUrl,
	sendRoomMessage,
	updateRoomSelection,
} from "@/lib/room-api";
import { loadRoomIntent, type RoomIntent } from "@/lib/room-intent";
import { RoomSafetyPanel } from "./room-safety-panel";
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
	close: () => void;
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

function PseudonymSetup({ onSaved }: { onSaved: () => void }) {
	const [pseudonym, setPseudonym] = useState("");
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		const parsed = PseudonymSchema.safeParse(pseudonym);
		if (!parsed.success) {
			setError(parsed.error.issues[0]?.message ?? "Wpisz prawidłowy pseudonim.");
			return;
		}
		setPending(true);
		setError("");
		try {
			const response = await fetch("/api/profile", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ action: "pseudonym", pseudonym: parsed.data }),
			});
			if (!response.ok) throw new Error("profile");
			onSaved();
		} catch {
			setError("Nie udało się zapisać pseudonimu. Spróbuj ponownie.");
		} finally {
			setPending(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Ustaw pseudonim</CardTitle>
				<CardDescription>Inne osoby nie zobaczą Twojego adresu e-mail.</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-3" onSubmit={submit}>
					<label className="block text-sm font-medium" htmlFor="room-pseudonym">
						Pseudonim
					</label>
					<Input
						id="room-pseudonym"
						value={pseudonym}
						onChange={(event) => setPseudonym(event.target.value)}
						autoComplete="nickname"
					/>
					{error ? <p className="text-sm text-destructive">{error}</p> : null}
					<Button type="submit" disabled={pending}>
						{pending ? "Zapisywanie…" : "Zapisz i wejdź do pokoju"}
					</Button>
				</form>
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
	const safety = useRoomSafety(snapshot?.room.id, async () => {
		const roomId = snapshot?.room.id;
		if (roomId) setSnapshot(await fetchRoomSnapshot(roomId));
	});

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
				if (caught instanceof Error && caught.name === "PSEUDONYM_REQUIRED") {
					setNeedsPseudonym(true);
				} else {
					setError(caught instanceof Error ? caught.message : "Nie udało się wejść do pokoju.");
				}
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [retryKey]);

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
			handleRealtimePayload(raw.data, setSnapshot, setError);
		}

		function handleClose() {
			if (!active) return;
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
	}, [snapshot?.room.id]);

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
			setError(caught instanceof Error ? caught.message : "Nie udało się wysłać wiadomości.");
		}
	}

	if (loading) return <p aria-live="polite">Przygotowujemy pokój lotu…</p>;
	if (needsPseudonym) return <PseudonymSetup onSaved={() => setRetryKey((value) => value + 1)} />;

	return (
		<section className="mx-auto max-w-5xl space-y-5">
			<div>
				<Badge variant="secondary">{connection}</Badge>
				<h1 className="mt-3 text-3xl font-bold tracking-tight">Pokój lotu</h1>
				<p className="mt-2 text-muted-foreground">
					LandingOS nie sprawdza karty pokładowej. Do pokoju wchodzą osoby deklarujące ten sam lot.
				</p>
			</div>

			{error ? (
				<Alert variant="destructive">
					<AlertTitle>Nie udało się wykonać operacji</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			) : null}

			{!snapshot ? (
				<Button asChild>
					<a href="/">Wróć do planera</a>
				</Button>
			) : (
				<div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
					<div className="space-y-5">
						<RoomSafetyPanel
							members={snapshot.members}
							currentPseudonym={snapshot.member.pseudonym}
							safety={safety}
						/>
						<Card>
							<CardHeader>
								<CardTitle className="text-xl">Twoja deklaracja</CardTitle>
								<CardDescription>Możesz zmienić ją w dowolnym momencie.</CardDescription>
							</CardHeader>
							<CardContent className="grid gap-2">
								<Button
									type="button"
									variant={
										snapshot.member.selection?.kind === "public_transport" ? "default" : "outline"
									}
									disabled={!intent || intent.selection.kind !== "public_transport"}
									onClick={() =>
										intent?.selection.kind === "public_transport" &&
										changeSelection(intent.selection)
									}
								>
									Transport publiczny
								</Button>
								<Button
									type="button"
									variant={
										snapshot.member.selection?.kind === "shared_taxi" ? "default" : "outline"
									}
									onClick={() => changeSelection({ kind: "shared_taxi" })}
								>
									Dzielona taksówka
								</Button>
							</CardContent>
						</Card>
					</div>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-xl">
								<MessageCircle className="size-5" />
								Wspólny czat
							</CardTitle>
							<CardDescription>Jedna rozmowa dla osób z tego lotu.</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="max-h-96 space-y-3 overflow-y-auto" aria-live="polite">
								{snapshot.messages.length === 0 ? (
									<p className="text-sm text-muted-foreground">Nie ma jeszcze wiadomości.</p>
								) : (
									snapshot.messages.map((item) => (
										<article key={item.id} className="rounded-md border p-3">
											<p className="text-sm font-semibold">{item.pseudonym}</p>
											<p className="whitespace-pre-wrap break-words">{item.content}</p>
											{item.pseudonym === snapshot.member.pseudonym ? null : (
												<Button
													type="button"
													size="sm"
													variant="ghost"
													className="mt-2"
													onClick={() => safety.startMessageReport(item.id)}
												>
													Zgłoś wiadomość
												</Button>
											)}
										</article>
									))
								)}
							</div>
							<form className="space-y-2" onSubmit={submitMessage}>
								<label className="text-sm font-medium" htmlFor="room-message">
									Wiadomość
								</label>
								<Input
									id="room-message"
									value={message}
									onChange={(event) => setMessage(event.target.value)}
									autoComplete="off"
								/>
								<div className="flex items-center justify-between gap-3">
									<span className="text-xs text-muted-foreground">
										{Array.from(message.trim()).length}/1000
									</span>
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
							</form>
						</CardContent>
					</Card>
				</div>
			)}

			{snapshot ? (
				<Button
					type="button"
					variant="ghost"
					onClick={() => void fetchRoomSnapshot(snapshot.room.id).then(setSnapshot)}
				>
					<RefreshCw className="size-4" />
					Odśwież historię
				</Button>
			) : null}
		</section>
	);
}
