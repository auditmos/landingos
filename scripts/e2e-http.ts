import type { IncomingMessage, ServerResponse } from "node:http";

export function applyFixtureCors(response: ServerResponse) {
	response.setHeader("access-control-allow-origin", "http://127.0.0.1:4173");
	response.setHeader("access-control-allow-credentials", "true");
	response.setHeader(
		"access-control-allow-headers",
		"authorization,content-type,x-landingos-funnel-id",
	);
	response.setHeader("access-control-allow-methods", "DELETE,GET,OPTIONS,PATCH,POST,PUT");
}

export function sendJson(
	response: ServerResponse,
	status: number,
	body: unknown,
	headers: Record<string, string> = {},
) {
	applyFixtureCors(response);
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		...headers,
	});
	response.end(JSON.stringify(body));
}

export async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	for await (const chunk of request) chunks.push(Buffer.from(chunk));
	if (chunks.length === 0) return {};
	const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
}
