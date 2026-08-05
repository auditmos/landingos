import { sanitizeJourneyExternalUrl } from "@repo/data-ops/journey";
import { ExternalLink, Eye, EyeOff, MapPin } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dropOffMapsUrl, loadPrivateDropOff } from "@/lib/private-drop-off";

/**
 * The traveler's own drop-off context. The label and link shown here come
 * from browser-local state and stay private; the share toggle is the only
 * path by which the label enters the room — as the `dropOffText` of the
 * traveler's own selection, revocable at any time.
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
	// Prefer the planner's exact navigation deep link; fall back to a place
	// search from the label when only shared text is available.
	const exactUrl = stored?.mapsUrl ? sanitizeJourneyExternalUrl(stored.mapsUrl) : null;
	const mapsUrl = exactUrl ?? (shownLabel ? dropOffMapsUrl(shownLabel) : null);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-lg">
					<MapPin className="size-5" />
					Punkt wysiadki
				</CardTitle>
				<CardDescription>
					{sharedDropOff
						? "Współpasażerowie widzą Twój punkt wysiadki przy Twojej deklaracji."
						: "Widoczny tylko dla Ciebie, dopóki go nie udostępnisz."}
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
