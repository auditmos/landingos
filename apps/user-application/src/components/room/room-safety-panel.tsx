import type { PublicRoomMember } from "@repo/data-ops/room";
import { SAFETY_REPORT_REASON_LABELS, SafetyReportReasonSchema } from "@repo/data-ops/safety";
import {
	Ban,
	Bus,
	CarTaxiFront,
	ChevronDown,
	Flag,
	Footprints,
	type LucideIcon,
	MapPin,
	RailSymbol,
	ShieldCheck,
	TrainFront,
	TramFront,
	Users,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { dropOffMapsUrl } from "@/lib/private-drop-off";
import { cn } from "@/lib/utils";
import { pseudonymColor, pseudonymInitials } from "./pseudonym-visuals";
import type { RoomSafetyController } from "./use-room-safety";

const modeIcons: Record<string, { icon: LucideIcon; label: string }> = {
	walk: { icon: Footprints, label: "Pieszo" },
	bus: { icon: Bus, label: "Autobus" },
	train: { icon: TrainFront, label: "Pociąg" },
	metro: { icon: RailSymbol, label: "Metro" },
	tram: { icon: TramFront, label: "Tramwaj" },
};

function MemberSelection({ member }: { member: PublicRoomMember }) {
	const selection = member.selection;
	if (!selection) {
		return <span>Jeszcze bez deklaracji</span>;
	}
	if (selection.kind === "shared_taxi") {
		return (
			<span className="flex shrink-0 items-center gap-1">
				<CarTaxiFront className="size-3.5 shrink-0" aria-hidden="true" />
				Szuka taksówki
			</span>
		);
	}
	const labels = selection.modes
		.map((mode) => modeIcons[mode]?.label)
		.filter((label): label is string => !!label);
	return (
		<span className="flex shrink-0 items-center gap-1.5" title={labels.join(" · ")}>
			{selection.modes.map((mode) => {
				const entry = modeIcons[mode];
				if (!entry) return null;
				const Icon = entry.icon;
				return <Icon key={mode} className="size-3.5" aria-label={entry.label} />;
			})}
		</span>
	);
}

function MemberDropOff({ dropOffText }: { dropOffText: string }) {
	const mapsUrl = dropOffMapsUrl(dropOffText);
	return (
		<span className="flex min-w-0 items-center gap-1" title="Punkt wysiadki">
			<MapPin className="size-3.5 shrink-0" aria-hidden="true" />
			{mapsUrl ? (
				<a
					href={mapsUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="truncate underline underline-offset-2 hover:text-primary"
				>
					{dropOffText}
				</a>
			) : (
				<span className="truncate">{dropOffText}</span>
			)}
		</span>
	);
}

function MemberAvatar({ pseudonym }: { pseudonym: string }) {
	return (
		<Avatar className="size-9">
			<AvatarFallback className={cn("text-xs font-semibold text-white", pseudonymColor(pseudonym))}>
				{pseudonymInitials(pseudonym)}
			</AvatarFallback>
		</Avatar>
	);
}

/**
 * Pre-acceptance gate: the community rules are the single interactive surface
 * until the traveler accepts. Rendered on its own so the rest of the room can
 * be dimmed behind it.
 */
export function CommunityRulesGate({ safety }: { safety: RoomSafetyController }) {
	if (!safety.rules || safety.rules.accepted) return null;
	return (
		<Card className="border-primary/40 shadow-lg ring-1 ring-primary/20">
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-xl">
					<ShieldCheck className="size-5 text-primary" />
					Zasady społeczności
				</CardTitle>
				<CardDescription>Zaakceptuj zasady, aby odblokować czat i resztę pokoju.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
					{safety.rules.topics.map((topic) => (
						<li key={topic}>{topic}</li>
					))}
				</ol>
				<Button
					type="button"
					size="lg"
					className="w-full"
					disabled={safety.pending}
					onClick={() => void safety.acceptRules()}
				>
					Akceptuję zasady
				</Button>
			</CardContent>
		</Card>
	);
}

/**
 * Post-acceptance disclosure: once accepted the rules collapse away and are
 * only shown when the traveler asks for them.
 */
export function CommunityRulesDisclosure({ safety }: { safety: RoomSafetyController }) {
	if (!safety.rules || !safety.rules.accepted) return null;
	return (
		<Collapsible className="rounded-lg border bg-card">
			<CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium">
				<span className="flex items-center gap-2 text-muted-foreground">
					<ShieldCheck className="size-4" />
					Zasady społeczności
				</span>
				<ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
			</CollapsibleTrigger>
			<CollapsibleContent>
				<ol className="list-decimal space-y-2 px-4 pb-4 pl-9 text-sm text-muted-foreground">
					{safety.rules.topics.map((topic) => (
						<li key={topic}>{topic}</li>
					))}
				</ol>
			</CollapsibleContent>
		</Collapsible>
	);
}

export function SafetyNotices({ safety }: { safety: RoomSafetyController }) {
	return (
		<>
			{safety.error ? (
				<Alert variant="destructive">
					<AlertDescription>{safety.error}</AlertDescription>
				</Alert>
			) : null}
			{safety.notice ? (
				<Alert>
					<AlertDescription>{safety.notice}</AlertDescription>
				</Alert>
			) : null}
		</>
	);
}

function ownFirst(members: PublicRoomMember[], currentPseudonym: string): PublicRoomMember[] {
	return [...members].sort((a, b) => {
		if (a.pseudonym === currentPseudonym) return -1;
		if (b.pseudonym === currentPseudonym) return 1;
		return 0;
	});
}

function MemberRow({
	member,
	own,
	blocked,
	safety,
}: {
	member: PublicRoomMember;
	own: boolean;
	blocked: boolean;
	safety: RoomSafetyController;
}) {
	return (
		<li className={cn("flex items-center gap-3 px-3 py-2.5", own && "bg-primary/5")}>
			<MemberAvatar pseudonym={member.pseudonym} />
			<div className={cn("min-w-0 flex-1", blocked && "opacity-50")}>
				<div className="flex items-center gap-2">
					<span className="truncate font-medium">{member.pseudonym}</span>
					{own ? (
						<Badge variant="secondary" className="rounded-full px-2 text-[11px]">
							Ty
						</Badge>
					) : null}
					{blocked ? (
						<Badge variant="outline" className="rounded-full px-2 text-[11px]">
							Zablokowano
						</Badge>
					) : null}
				</div>
				<div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
					<MemberSelection member={member} />
					{member.selection?.dropOffText ? (
						<>
							<span aria-hidden="true" className="shrink-0">
								·
							</span>
							<MemberDropOff dropOffText={member.selection.dropOffText} />
						</>
					) : null}
				</div>
			</div>
			{own ? null : (
				<div className="flex shrink-0 gap-0.5">
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="size-11 text-muted-foreground hover:text-foreground"
						disabled={safety.pending}
						aria-label={blocked ? "Odblokuj" : "Zablokuj"}
						title={blocked ? "Odblokuj" : "Zablokuj"}
						onClick={() =>
							void (blocked ? safety.unblock(member.pseudonym) : safety.block(member.pseudonym))
						}
					>
						<Ban className={cn("size-4", blocked && "text-destructive")} />
					</Button>
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="size-11 text-muted-foreground hover:text-foreground"
						aria-label="Zgłoś osobę"
						title="Zgłoś osobę"
						onClick={() => safety.startMemberReport(member.pseudonym)}
					>
						<Flag className="size-4" />
					</Button>
				</div>
			)}
		</li>
	);
}

export function RoomMembers({
	members,
	currentPseudonym,
	safety,
}: {
	members: PublicRoomMember[];
	currentPseudonym: string;
	safety: RoomSafetyController;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-lg">
					<Users className="size-5" />
					Osoby w pokoju
					<Badge variant="secondary">{members.length}</Badge>
				</CardTitle>
				<CardDescription>Widoczne są wyłącznie pseudonimy i publiczne deklaracje.</CardDescription>
			</CardHeader>
			<CardContent>
				<ul className="divide-y divide-border overflow-hidden rounded-lg border">
					{ownFirst(members, currentPseudonym).map((member, index) => (
						<MemberRow
							key={`${member.pseudonym}:${index}`}
							member={member}
							own={member.pseudonym === currentPseudonym}
							blocked={safety.blockedPseudonyms.includes(member.pseudonym)}
							safety={safety}
						/>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}

export function ReportForm({ safety }: { safety: RoomSafetyController }) {
	if (!safety.reportTarget) return null;
	return (
		<Card className="border-primary/40">
			<CardHeader>
				<CardTitle className="text-lg">Zgłoś problem</CardTitle>
				<CardDescription>
					Zgłoszenie trafi do ograniczonego magazynu bezpieczeństwa.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<label className="block text-sm font-medium" htmlFor="report-reason">
					Powód
				</label>
				<select
					id="report-reason"
					className="h-10 w-full rounded-md border bg-background px-3 text-sm"
					value={safety.reportReason}
					onChange={(event) => {
						const parsed = SafetyReportReasonSchema.safeParse(event.target.value);
						if (parsed.success) safety.setReportReason(parsed.data);
					}}
				>
					{SafetyReportReasonSchema.options.map((reason) => (
						<option key={reason} value={reason}>
							{SAFETY_REPORT_REASON_LABELS[reason]}
						</option>
					))}
				</select>
				<label className="block text-sm font-medium" htmlFor="report-note">
					Notatka opcjonalna
				</label>
				<textarea
					id="report-note"
					className="min-h-24 w-full rounded-md border bg-background p-3 text-sm"
					value={safety.reportNote}
					onChange={(event) => safety.setReportNote(event.target.value)}
				/>
				<p className="text-xs text-muted-foreground">{Array.from(safety.reportNote).length}/500</p>
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						disabled={safety.pending || Array.from(safety.reportNote).length > 500}
						onClick={() => void safety.submitReport()}
					>
						Wyślij zgłoszenie
					</Button>
					<Button type="button" variant="outline" onClick={safety.cancelReport}>
						Anuluj
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
