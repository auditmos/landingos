import { ChevronDown, ExternalLink, Eye, EyeOff, MapPin } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dropOffMapsUrl, loadPrivateDropOff } from "@/lib/private-drop-off";

const modeCopy: Record<string, string> = {
	bus: "Autobus",
	train: "Pociąg",
	metro: "Metro",
	tram: "Tramwaj",
	walk: "Pieszo",
};

/**
 * The traveler's own journey context. The label and route shown here come
 * from browser-local state and stay private; the share toggle is the only
 * path by which the label enters the room — as the `dropOffText` of the
 * traveler's own selection, revocable at any time. The route is never shared.
 */
export function DropOffPanel({
	flightInstanceId,
	sharedDropOff,
	canShare,
	onShare,
	onUnshare,
}: {
	flightInstanceId: string;
	sharedDropOff: string | undefined;
	canShare: boolean;
	onShare: (label: string) => void;
	onUnshare: () => void;
}) {
	const [stored] = useState(() => loadPrivateDropOff(flightInstanceId));
	const privateLabel = stored?.label;
	if (!privateLabel && !sharedDropOff) return null;

	const shownLabel = sharedDropOff ?? privateLabel;
	const mapsUrl = shownLabel ? dropOffMapsUrl(shownLabel) : null;
	const route = stored?.route ?? [];
	const totalMinutes = route.reduce((sum, step) => sum + step.durationMinutes, 0);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-lg">
					<MapPin className="size-5" />
					Twoja podróż
				</CardTitle>
				<CardDescription>
					{sharedDropOff
						? "Współpasażerowie widzą Twój punkt wysiadki przy Twojej deklaracji."
						: "Widoczna tylko dla Ciebie, dopóki nie udostępnisz punktu wysiadki."}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<p className="text-pretty text-sm">
					<span className="text-muted-foreground">
						{sharedDropOff ? "Udostępniony punkt: " : "Twój cel: "}
					</span>
					{mapsUrl ? (
						<a
							href={mapsUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:text-primary"
						>
							{shownLabel}
							<ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
						</a>
					) : (
						<span className="font-medium">{shownLabel}</span>
					)}
				</p>

				{route.length > 0 ? (
					<details className="group rounded-md border border-border">
						<summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
							Twoja trasa ({route.length} {route.length === 1 ? "etap" : "etapów"} ·{" "}
							<span className="tabular-nums">{totalMinutes} min</span>)
							<ChevronDown
								className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
								aria-hidden="true"
							/>
						</summary>
						<div className="space-y-2 border-t border-border px-3 py-3">
							<ol className="space-y-2">
								{route.map((step, index) => (
									<li key={`${step.mode}:${step.from}:${step.to}:${index}`} className="text-sm">
										<p className="font-medium tabular-nums">
											{index + 1}. {modeCopy[step.mode] ?? step.mode} · {step.durationMinutes} min
										</p>
										<p className="text-pretty text-muted-foreground">
											{step.from} → {step.to}
										</p>
									</li>
								))}
							</ol>
							<p className="text-pretty text-xs text-muted-foreground">
								Trasa jest widoczna tylko dla Ciebie.
							</p>
						</div>
					</details>
				) : null}

				{sharedDropOff ? (
					<Button type="button" variant="outline" onClick={() => onUnshare()}>
						<EyeOff className="size-4" />
						Przestań udostępniać
					</Button>
				) : (
					<Button
						type="button"
						variant="outline"
						disabled={!canShare || !privateLabel}
						onClick={() => privateLabel && onShare(privateLabel)}
					>
						<Eye className="size-4" />
						Udostępnij współpasażerom
					</Button>
				)}
				{!sharedDropOff && !canShare ? (
					<p className="text-pretty text-xs text-muted-foreground">
						Najpierw zapisz deklarację transportu, aby udostępnić punkt wysiadki.
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}
