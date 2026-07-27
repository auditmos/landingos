import { z } from "zod";

const APPROVED_EXTERNAL_HOSTS = new Set([
	"maps.google.com",
	"www.airportbusexpress.it",
	"www.google.com",
	"www.milanbergamoairport.it",
]);

const REDIRECT_PARAMETERS = new Set([
	"continue",
	"next",
	"redirect",
	"redirect_uri",
	"target",
	"url",
]);

export function sanitizeJourneyExternalUrl(rawUrl: string, depth = 0): string | null {
	if (depth > 2) return null;
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}
	if (
		url.protocol !== "https:" ||
		url.username.length > 0 ||
		url.password.length > 0 ||
		!APPROVED_EXTERNAL_HOSTS.has(url.hostname.toLowerCase())
	) {
		return null;
	}
	for (const [parameter, redirect] of url.searchParams) {
		if (
			REDIRECT_PARAMETERS.has(parameter.toLowerCase()) &&
			sanitizeJourneyExternalUrl(redirect, depth + 1) === null
		) {
			return null;
		}
	}
	return rawUrl;
}

export const ApprovedJourneyExternalUrlSchema = z
	.string()
	.refine(
		(value) => sanitizeJourneyExternalUrl(value) !== null,
		"Dozwolony jest wyłącznie zatwierdzony adres HTTPS.",
	);
