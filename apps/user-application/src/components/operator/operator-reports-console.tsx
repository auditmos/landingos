import {
	SAFETY_REPORT_QUEUE_PAGE_SIZE,
	SAFETY_REPORT_REASON_LABELS,
	type SafetyReportQueueItem,
	type SafetyReportReason,
	SafetyReportReasonSchema,
} from "@repo/data-ops/safety";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Flag, MessageSquareWarning, Plane, ShieldAlert, UserRound } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listSafetyReports, OperatorReportsApiError } from "@/lib/operator-reports-api";

const ANONYMOUS_LABEL = "konto usunięte";

function formatMoment(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString("pl-PL", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * A revoked operator keeps a valid session, so the queue can start failing with
 * 403 while the panel is open. That reads as a permissions change, not an
 * outage, and the copy has to say so.
 */
function queueError(error: unknown): { title: string; description: string } {
	if (error instanceof OperatorReportsApiError && (error.status === 401 || error.status === 403)) {
		return {
			title: "Brak uprawnień operatora",
			description: "Ta sesja nie ma już dostępu do kolejki zgłoszeń. Zaloguj się ponownie.",
		};
	}
	return {
		title: "Nie udało się pobrać kolejki zgłoszeń",
		description: error instanceof Error ? error.message : "Spróbuj ponownie za chwilę.",
	};
}

function Party({ label, pseudonym }: { label: string; pseudonym: string | null }) {
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			<UserRound className="size-3.5 shrink-0" aria-hidden="true" />
			<span className="shrink-0 text-muted-foreground">{label}:</span>
			<span
				className={pseudonym ? "truncate font-medium" : "truncate italic text-muted-foreground"}
			>
				{pseudonym ?? ANONYMOUS_LABEL}
			</span>
		</span>
	);
}

/**
 * The frozen copy of the reported message. A message report whose snapshot has
 * already been purged still has to be reviewable, so the absence of evidence is
 * rendered explicitly instead of collapsing into an empty card.
 */
function ReportEvidence({ report }: { report: SafetyReportQueueItem }) {
	if (!report.messageId) {
		return (
			<p className="text-sm text-muted-foreground">
				Zgłoszenie dotyczy osoby, nie pojedynczej wiadomości.
			</p>
		);
	}
	if (!report.evidenceSnapshot) {
		return (
			<p className="text-sm italic text-muted-foreground">
				Treść wiadomości została usunięta po upływie okresu retencji.
			</p>
		);
	}
	return (
		<figure className="rounded-lg border bg-muted/40 p-3">
			<blockquote className="whitespace-pre-wrap break-words text-sm text-foreground">
				{report.evidenceSnapshot.messageText}
			</blockquote>
			<figcaption className="mt-2 text-xs text-muted-foreground">
				{report.evidenceSnapshot.authorPseudonym} ·{" "}
				{formatMoment(report.evidenceSnapshot.originalMessageAt)}
			</figcaption>
		</figure>
	);
}

function ReportCard({ report }: { report: SafetyReportQueueItem }) {
	return (
		<Card>
			<CardHeader className="gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant="warning">{SAFETY_REPORT_REASON_LABELS[report.reason]}</Badge>
					<Badge variant="outline">Otwarte</Badge>
					{report.messageId ? (
						<Badge variant="secondary" className="gap-1">
							<MessageSquareWarning className="size-3.5" aria-hidden="true" />
							Wiadomość
						</Badge>
					) : (
						<Badge variant="secondary" className="gap-1">
							<Flag className="size-3.5" aria-hidden="true" />
							Osoba
						</Badge>
					)}
					<span className="ml-auto text-xs text-muted-foreground">
						{formatMoment(report.createdAt)}
					</span>
				</div>
				<CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
					<Party label="Zgłasza" pseudonym={report.reporterPseudonym} />
					<Party label="Zgłoszony" pseudonym={report.targetPseudonym} />
					<span className="flex items-center gap-1.5">
						<Plane className="size-3.5 shrink-0" aria-hidden="true" />
						{report.flightDesignator} · {report.departureLocalDate}
					</span>
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<ReportEvidence report={report} />
				{report.note ? (
					<div>
						<p className="text-xs font-medium text-muted-foreground">Notatka zgłaszającego</p>
						<p className="mt-1 whitespace-pre-wrap break-words text-sm">{report.note}</p>
					</div>
				) : null}
				{/* Identifier only — operators are not members and cannot open the room. */}
				<p className="text-xs text-muted-foreground">
					Pokój <code className="font-mono text-muted-foreground">{report.roomId}</code>
				</p>
			</CardContent>
		</Card>
	);
}

export function OperatorReportsConsole() {
	const [reason, setReason] = useState<SafetyReportReason | "">("");
	const query = useInfiniteQuery({
		queryKey: ["operator", "safety-reports", reason] as const,
		queryFn: ({ pageParam }) =>
			listSafetyReports({
				...(reason ? { reason } : {}),
				limit: SAFETY_REPORT_QUEUE_PAGE_SIZE,
				offset: pageParam,
			}),
		initialPageParam: 0,
		getNextPageParam: (lastPage, pages) =>
			lastPage.hasMore ? pages.length * SAFETY_REPORT_QUEUE_PAGE_SIZE : undefined,
	});

	// Offset paging over a queue that keeps growing can hand back the same report
	// on two pages once a newer one shifts the window; dedupe so a fresh report
	// arriving mid-review never renders twice.
	const reports = [
		...new Map(
			(query.data?.pages ?? [])
				.flatMap((page) => page.reports)
				.map((report) => [report.id, report] as const),
		).values(),
	];

	return (
		<section className="space-y-6" aria-labelledby="operator-reports-title">
			<div>
				<h1
					id="operator-reports-title"
					className="text-3xl font-semibold tracking-tight text-balance"
				>
					Zgłoszenia bezpieczeństwa
				</h1>
				<p className="mt-2 max-w-2xl text-muted-foreground text-pretty">
					Kolejka otwartych zgłoszeń z pokojów lotu, od najnowszych. Widoczne są wyłącznie
					pseudonimy oraz zamrożona treść zgłoszonej wiadomości — panel nie ma dostępu do celów
					podróży, adresów e-mail ani pozostałej treści czatu.
				</p>
			</div>

			<div className="flex flex-wrap items-end gap-3">
				<div>
					<label className="block text-sm font-medium" htmlFor="report-reason-filter">
						Powód
					</label>
					<select
						id="report-reason-filter"
						className="mt-1 h-10 w-full min-w-64 rounded-md border bg-background px-3 text-sm"
						value={reason}
						onChange={(event) => {
							const parsed = SafetyReportReasonSchema.safeParse(event.target.value);
							setReason(parsed.success ? parsed.data : "");
						}}
					>
						<option value="">Wszystkie powody</option>
						{SafetyReportReasonSchema.options.map((option) => (
							<option key={option} value={option}>
								{SAFETY_REPORT_REASON_LABELS[option]}
							</option>
						))}
					</select>
				</div>
				<Button
					type="button"
					variant="outline"
					disabled={query.isFetching}
					onClick={() => void query.refetch()}
				>
					Odśwież
				</Button>
			</div>

			{query.isPending ? <output>Ładowanie zgłoszeń…</output> : null}

			{query.error ? (
				<Alert variant="destructive">
					<ShieldAlert className="size-4" />
					<AlertTitle>{queueError(query.error).title}</AlertTitle>
					<AlertDescription>{queueError(query.error).description}</AlertDescription>
				</Alert>
			) : null}

			{!query.isPending && !query.error && reports.length === 0 ? (
				<Card>
					<CardHeader>
						<CardTitle className="text-lg">Brak zgłoszeń</CardTitle>
						<CardDescription>Żadne zgłoszenie nie czeka na przegląd.</CardDescription>
					</CardHeader>
				</Card>
			) : null}

			<div className="space-y-4">
				{reports.map((report) => (
					<ReportCard key={report.id} report={report} />
				))}
			</div>

			{query.hasNextPage ? (
				<Button
					type="button"
					variant="outline"
					disabled={query.isFetchingNextPage}
					onClick={() => void query.fetchNextPage()}
				>
					{query.isFetchingNextPage ? "Wczytywanie…" : "Wczytaj więcej"}
				</Button>
			) : null}
		</section>
	);
}
