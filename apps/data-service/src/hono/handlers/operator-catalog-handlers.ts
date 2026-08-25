import { getAuth } from "@repo/data-ops/auth/server";
import { getDb } from "@repo/data-ops/database/setup";
import {
	TransferCatalogDraftInputSchema,
	TransferCatalogDraftPatchSchema,
	type TransferCatalogRecord,
	TransferCatalogRecordSchema,
} from "@repo/data-ops/journey";
import { getUserRoleById } from "@repo/data-ops/operator";
import { Hono } from "hono";
import {
	type CatalogService,
	createCatalogService,
	createDatabaseCatalogRepository,
	resolveCatalogFreshnessDays,
} from "../../operator/catalog-service";
import {
	type OperatorOnlyOptions,
	type OperatorSession,
	operatorOnly,
} from "../middleware/operator-only";
import { type BodyError, parseJsonBody } from "../utils/request-body";

interface OperatorCatalogHandlerDependencies extends OperatorOnlyOptions {
	createService(env: Env): CatalogService;
}

const defaultDependencies: OperatorCatalogHandlerDependencies = {
	createService: (env) =>
		createCatalogService(createDatabaseCatalogRepository(getDb()), {
			now: () => new Date(),
			freshnessDays: resolveCatalogFreshnessDays(env),
		}),
	getSession: async (request) =>
		(await getAuth().api.getSession({
			headers: request.headers,
		})) as OperatorSession | null,
	getUserRole: (userId) => getUserRoleById(getDb(), userId),
};

function publicRecord(record: TransferCatalogRecord): TransferCatalogRecord {
	return TransferCatalogRecordSchema.parse(record);
}

function inputError(error: BodyError) {
	const fieldErrors: Record<string, string> = {};
	for (const issue of error.issues) {
		const field = typeof issue.path[0] === "string" ? issue.path[0] : "_form";
		fieldErrors[field] = "Nieprawidłowa wartość.";
	}
	if (Object.keys(fieldErrors).length === 0) {
		fieldErrors._form = "Nieprawidłowe dane formularza.";
	}
	return { code: "CATALOG_INPUT_INVALID", error: "Popraw dane formularza.", fieldErrors };
}

function notFound() {
	return { code: "CATALOG_NOT_FOUND", error: "Nie znaleziono wpisu katalogu." };
}

export function createOperatorCatalogHandlers(
	dependencies: OperatorCatalogHandlerDependencies = defaultDependencies,
) {
	const catalog = new Hono<{ Bindings: Env }>();
	catalog.use("*", operatorOnly(dependencies));

	catalog.get("/", async (c) => {
		const entries = await dependencies.createService(c.env).list();
		return c.json({ entries: entries.map(publicRecord) });
	});

	catalog.get("/:id", async (c) => {
		const entry = await dependencies.createService(c.env).get(c.req.param("id"));
		return entry ? c.json(publicRecord(entry)) : c.json(notFound(), 404);
	});

	catalog.post("/", async (c) => {
		const body = await parseJsonBody(c, TransferCatalogDraftInputSchema, {});
		if (!body.ok) return c.json(inputError(body.error), 400);
		const entry = await dependencies.createService(c.env).create(body.data);
		return c.json(publicRecord(entry), 201);
	});

	catalog.post("/publish", async (c) => {
		const body = await parseJsonBody(c, TransferCatalogDraftInputSchema, {});
		if (!body.ok) return c.json(inputError(body.error), 400);
		const result = await dependencies.createService(c.env).saveAndPublish(null, body.data);
		if (!result.ok && result.reason === "validation_error") {
			return c.json(
				{
					code: "CATALOG_VALIDATION",
					error: "Wpis nie spełnia warunków publikacji.",
					fieldErrors: result.fieldErrors,
				},
				422,
			);
		}
		if (!result.ok) return c.json(notFound(), 404);
		return c.json(publicRecord(result.data), 201);
	});

	catalog.patch("/:id", async (c) => {
		const body = await parseJsonBody(c, TransferCatalogDraftPatchSchema, {});
		if (!body.ok) return c.json(inputError(body.error), 400);
		const result = await dependencies.createService(c.env).update(c.req.param("id"), body.data);
		if (!result.ok && result.reason === "validation_error") {
			return c.json(
				{
					code: "CATALOG_VALIDATION",
					error: "Opublikowany wpis musi pozostać kompletny i aktualny.",
					fieldErrors: result.fieldErrors,
				},
				422,
			);
		}
		return result.ok ? c.json(publicRecord(result.data)) : c.json(notFound(), 404);
	});

	// The one route that reads its body by hand: `parseJsonBody`'s stand-ins cannot
	// express "no body at all", and this route must tell that apart from `{}` to know
	// whether it is publishing the saved draft or saving new values first.
	catalog.post("/:id/publish", async (c) => {
		const body = await c.req.json().catch(() => null);
		const publishesSavedDraft =
			body === null ||
			(typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0);
		const service = dependencies.createService(c.env);
		let result: Awaited<ReturnType<CatalogService["publish"]>>;
		if (publishesSavedDraft) {
			result = await service.publish(c.req.param("id"));
		} else {
			const parsed = TransferCatalogDraftInputSchema.safeParse(body);
			if (!parsed.success) return c.json(inputError(parsed.error), 400);
			result = await service.saveAndPublish(c.req.param("id"), parsed.data);
		}
		if (!result.ok && result.reason === "validation_error") {
			return c.json(
				{
					code: "CATALOG_VALIDATION",
					error: "Wpis nie spełnia warunków publikacji.",
					fieldErrors: result.fieldErrors,
				},
				422,
			);
		}
		if (!result.ok) return c.json(notFound(), 404);
		return c.json(publicRecord(result.data));
	});

	catalog.post("/:id/unpublish", async (c) => {
		const result = await dependencies.createService(c.env).unpublish(c.req.param("id"));
		return result.ok ? c.json(publicRecord(result.data)) : c.json(notFound(), 404);
	});

	catalog.delete("/:id", async (c) => {
		const deleted = await dependencies.createService(c.env).delete(c.req.param("id"));
		return deleted ? c.body(null, 204) : c.json(notFound(), 404);
	});

	return catalog;
}

export default createOperatorCatalogHandlers();
