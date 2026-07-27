import { ANALYTICS_FUNNEL_HEADER, FunnelIdSchema } from "@repo/data-ops/analytics";

const FUNNEL_STORAGE_KEY = "landingos.analytics-funnel";

function storage(): Storage | null {
	return typeof window === "undefined" ? null : window.sessionStorage;
}

export function loadAnalyticsFunnel(): string | undefined {
	const current = storage()?.getItem(FUNNEL_STORAGE_KEY);
	const parsed = FunnelIdSchema.safeParse(current);
	if (parsed.success) return parsed.data;
	if (current) storage()?.removeItem(FUNNEL_STORAGE_KEY);
	return undefined;
}

export function analyticsFunnelHeaders(): Record<string, string> {
	const funnelId = loadAnalyticsFunnel();
	return funnelId ? { [ANALYTICS_FUNNEL_HEADER]: funnelId } : {};
}

export function captureAnalyticsFunnel(response: Response): void {
	const parsed = FunnelIdSchema.safeParse(response.headers.get(ANALYTICS_FUNNEL_HEADER));
	if (parsed.success) storage()?.setItem(FUNNEL_STORAGE_KEY, parsed.data);
}

export function clearAnalyticsFunnel(): void {
	storage()?.removeItem(FUNNEL_STORAGE_KEY);
}
