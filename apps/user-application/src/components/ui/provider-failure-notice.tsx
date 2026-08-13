import type { ProviderDiagnostic } from "@repo/data-ops/diagnostics";
import { ChevronDown } from "lucide-react";
import {
	formatDiagnosticTime,
	MVP_PROVIDER_LIMIT_NOTICE,
	type ProviderOutcomeGuidance,
	providerCategoryCopy,
	providerClassCopy,
	providerRecoveryCopy,
	resolveRecovery,
} from "@/lib/provider-diagnostics";

/**
 * Expandable QA detail. It renders only when the server's environment exposure rule
 * released the normalized class and category — production responses carry neither.
 */
function ProviderDiagnosticDetails({ diagnostic }: { diagnostic?: ProviderDiagnostic }) {
	if (!diagnostic?.category || !diagnostic.providerClass) return null;
	return (
		<details className="group mt-3 rounded-md border border-border/70">
			<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
				Szczegóły diagnostyczne
				<ChevronDown
					className="size-4 transition-transform group-open:rotate-180"
					aria-hidden="true"
				/>
			</summary>
			<dl className="grid gap-1 border-t border-border/70 px-3 py-3 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-3">
				<dt className="font-medium">Obszar danych</dt>
				<dd>{providerClassCopy[diagnostic.providerClass]}</dd>
				<dt className="font-medium">Kategoria</dt>
				<dd>{providerCategoryCopy[diagnostic.category]}</dd>
				<dt className="font-medium">Czas zdarzenia</dt>
				<dd className="tabular-nums">{formatDiagnosticTime(diagnostic.occurredAtUtc)}</dd>
				<dt className="font-medium">Numer korelacji</dt>
				<dd className="break-all tabular-nums">{diagnostic.reference}</dd>
			</dl>
		</details>
	);
}

/**
 * Two copy levels in one place: the traveler reads the outcome, the MVP limitation, and
 * the one action that helps; a staging tester can expand the safe diagnostic detail.
 */
export function ProviderFailureNotice({
	message,
	guidance,
	diagnostic,
}: {
	message: string;
	guidance: ProviderOutcomeGuidance;
	diagnostic?: ProviderDiagnostic;
}) {
	const resolved = resolveRecovery(guidance, diagnostic);
	return (
		<div className="space-y-2">
			<p className="text-pretty">{message}</p>
			<p className="text-pretty">{providerRecoveryCopy[resolved.recovery]}</p>
			<p className="text-pretty text-xs">{MVP_PROVIDER_LIMIT_NOTICE}</p>
			<ProviderDiagnosticDetails diagnostic={diagnostic} />
		</div>
	);
}
