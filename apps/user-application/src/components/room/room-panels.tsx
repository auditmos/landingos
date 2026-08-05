import type {
	PublicRoomMessage,
	PublicTransportSelection,
	RoomSelection,
} from "@repo/data-ops/room";
import { Bus, Car, Plane } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { pseudonymColor, pseudonymInitials } from "./pseudonym-visuals";

function formatMessageTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
}

export function ChatMessageItem({
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

export function RoomStatusBar({
	connection,
	showFlights,
	onShowFlights,
}: {
	connection: string;
	showFlights: boolean;
	onShowFlights: () => void;
}) {
	return (
		<div className="flex items-center gap-2">
			{showFlights ? (
				<Button type="button" variant="ghost" size="sm" onClick={onShowFlights}>
					<Plane className="size-4" />
					Moje loty
				</Button>
			) : null}
			<Badge variant="secondary">{connection}</Badge>
		</div>
	);
}

export function SelectionPanel({
	selectedKind,
	publicOption,
	onChange,
}: {
	selectedKind: RoomSelection["kind"] | undefined;
	publicOption: PublicTransportSelection | null;
	onChange: (selection: RoomSelection) => void;
}) {
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
