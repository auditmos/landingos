import type { PublicRoomMember } from "@repo/data-ops/room";
import { SafetyReportReasonSchema } from "@repo/data-ops/safety";
import { ShieldCheck, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RoomSafetyController } from "./use-room-safety";

const reasonCopy = {
	harassment_or_discrimination: "Nękanie lub dyskryminacja",
	threats_or_impersonation: "Groźby lub podszywanie się",
	money_or_private_information: "Presja dotycząca pieniędzy lub prywatnych informacji",
	personal_data: "Udostępnianie cudzych danych",
	illegal_content: "Nielegalna treść",
	commercial_spam: "Spam komercyjny",
	other: "Inny problem",
} as const;

function selectionLabel(member: PublicRoomMember) {
	if (!member.selection) return "Jeszcze bez deklaracji";
	if (member.selection.kind === "shared_taxi") return "Dzielona taksówka";
	return member.selection.operatorNames.length > 0
		? member.selection.operatorNames.join(", ")
		: member.selection.modes.join(", ");
}

function CommunityRules({ safety }: { safety: RoomSafetyController }) {
	if (!safety.rules) return null;
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-xl">
					<ShieldCheck className="size-5" />
					Zasady społeczności
				</CardTitle>
				<CardDescription>Przeczytaj je przed wysłaniem pierwszej wiadomości.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<ol className="list-decimal space-y-2 pl-5 text-sm">
					{safety.rules.topics.map((topic) => (
						<li key={topic}>{topic}</li>
					))}
				</ol>
				{safety.rules.accepted ? (
					<Badge variant="secondary">Zaakceptowano aktualną wersję</Badge>
				) : (
					<Button type="button" disabled={safety.pending} onClick={() => void safety.acceptRules()}>
						Akceptuję zasady
					</Button>
				)}
			</CardContent>
		</Card>
	);
}

function ReportForm({ safety }: { safety: RoomSafetyController }) {
	if (!safety.reportTarget) return null;
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-xl">Zgłoś problem</CardTitle>
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
							{reasonCopy[reason]}
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

export function RoomSafetyPanel({
	members,
	currentPseudonym,
	safety,
}: {
	members: PublicRoomMember[];
	currentPseudonym: string;
	safety: RoomSafetyController;
}) {
	return (
		<div className="space-y-5">
			<CommunityRules safety={safety} />
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
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-xl">
						<Users className="size-5" />
						Osoby w pokoju
					</CardTitle>
					<CardDescription>
						Widoczne są wyłącznie pseudonimy i publiczne deklaracje.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ul className="space-y-2">
						{members.map((member, index) => {
							const own = member.pseudonym === currentPseudonym;
							const blocked = safety.blockedPseudonyms.includes(member.pseudonym);
							return (
								<li key={`${member.pseudonym}:${index}`} className="rounded-md border p-3">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<span className="font-medium">{member.pseudonym}</span>
										<Badge variant="secondary">{selectionLabel(member)}</Badge>
									</div>
									{own ? null : (
										<div className="mt-3 flex flex-wrap gap-2">
											<Button
												type="button"
												size="sm"
												variant="outline"
												disabled={safety.pending}
												onClick={() =>
													void (blocked
														? safety.unblock(member.pseudonym)
														: safety.block(member.pseudonym))
												}
											>
												{blocked ? "Odblokuj" : "Zablokuj"}
											</Button>
											<Button
												type="button"
												size="sm"
												variant="ghost"
												onClick={() => safety.startMemberReport(member.pseudonym)}
											>
												Zgłoś osobę
											</Button>
										</div>
									)}
								</li>
							);
						})}
					</ul>
				</CardContent>
			</Card>
			<ReportForm safety={safety} />
		</div>
	);
}
