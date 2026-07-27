import {
	DEFAULT_TRANSFER_CATALOG_FRESHNESS_DAYS,
	type TransferCatalogDraftInput,
	type TransferCatalogEditableField,
	type TransferCatalogRecord,
} from "@repo/data-ops/journey";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Bus, Plus, Save, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	CatalogApiError,
	createCatalogDraft,
	deleteCatalogEntry,
	getCatalogPublishFieldErrors,
	listCatalogEntries,
	publishCatalogEntry,
	unpublishCatalogEntry,
	updateCatalogDraft,
} from "@/lib/operator-catalog-api";

const catalogQueryKey = ["operator", "transfer-catalog"] as const;

const textFields = [
	{ name: "operatorName", label: "Nazwa operatora" },
	{ name: "serviceName", label: "Nazwa usługi" },
	{ name: "destinationStopCode", label: "Kod przystanku docelowego" },
	{ name: "destinationStopName", label: "Nazwa przystanku docelowego" },
	{ name: "sourceUrl", label: "Adres źródła" },
	{ name: "purchaseUrl", label: "Łącze zakupu" },
] as const;

const numberFields = [
	{ name: "durationMinutes", label: "Czas przejazdu (min)" },
	{ name: "transferCount", label: "Liczba przesiadek" },
	{ name: "walkingMinutes", label: "Pieszo (min)" },
	{ name: "walkingMeters", label: "Pieszo (m)" },
	{ name: "costMinorMin", label: "Cena minimalna (centy EUR)" },
	{ name: "costMinorMax", label: "Cena maksymalna (centy EUR)" },
] as const;

type FormValues = Record<TransferCatalogEditableField, string>;

function formValues(entry: TransferCatalogRecord | null): FormValues {
	const value = (field: TransferCatalogEditableField) => {
		const current = entry?.[field];
		return current === null || current === undefined ? "" : String(current);
	};
	return {
		operatorName: value("operatorName"),
		serviceName: value("serviceName"),
		destinationStopCode: value("destinationStopCode"),
		destinationStopName: value("destinationStopName"),
		durationMinutes: value("durationMinutes"),
		transferCount: value("transferCount"),
		walkingMinutes: value("walkingMinutes"),
		walkingMeters: value("walkingMeters"),
		sourceUrl: value("sourceUrl"),
		checkedAt: entry?.checkedAt ? entry.checkedAt.slice(0, 16) : "",
		costMinorMin: value("costMinorMin"),
		costMinorMax: value("costMinorMax"),
		purchaseUrl: value("purchaseUrl"),
	};
}

function draftInput(values: FormValues): TransferCatalogDraftInput {
	const integer = (field: (typeof numberFields)[number]["name"]) =>
		values[field] === "" ? null : Number(values[field]);
	let checkedAt: string | null = null;
	if (values.checkedAt) {
		const parsed = new Date(values.checkedAt);
		checkedAt = Number.isNaN(parsed.getTime()) ? values.checkedAt : parsed.toISOString();
	}
	return {
		operatorName: values.operatorName || null,
		serviceName: values.serviceName || null,
		destinationStopCode: values.destinationStopCode || null,
		destinationStopName: values.destinationStopName || null,
		durationMinutes: integer("durationMinutes"),
		transferCount: integer("transferCount"),
		walkingMinutes: integer("walkingMinutes"),
		walkingMeters: integer("walkingMeters"),
		sourceUrl: values.sourceUrl || null,
		checkedAt,
		costMinorMin: integer("costMinorMin"),
		costMinorMax: integer("costMinorMax"),
		purchaseUrl: values.purchaseUrl || null,
	};
}

function statusLabel(entry: TransferCatalogRecord) {
	const publication = entry.publicationStatus === "published" ? "Opublikowany" : "Szkic";
	const freshness = {
		fresh: "świeże",
		stale: "nieaktualne",
		incomplete: "niekompletne",
	}[entry.freshness];
	return `${publication} · ${freshness}`;
}

interface CatalogEditorProps {
	entry: TransferCatalogRecord | null;
	onSaved(entry: TransferCatalogRecord): void;
	onDeleted(): void;
}

function CatalogEditor({ entry, onSaved, onDeleted }: CatalogEditorProps) {
	const queryClient = useQueryClient();
	const [fieldErrors, setFieldErrors] = useState<
		Partial<Record<TransferCatalogEditableField, string>>
	>({});
	const [message, setMessage] = useState<string | null>(null);

	const refresh = async () => queryClient.invalidateQueries({ queryKey: catalogQueryKey });
	const saveMutation = useMutation({
		mutationFn: (input: TransferCatalogDraftInput) =>
			entry ? updateCatalogDraft(entry.id, input) : createCatalogDraft(input),
		onSuccess: async (saved) => {
			setFieldErrors({});
			setMessage("Szkic został zapisany.");
			onSaved(saved);
			await refresh();
		},
		onError: (error) => {
			if (error instanceof CatalogApiError) setFieldErrors(error.fieldErrors);
		},
	});
	const publishMutation = useMutation({
		mutationFn: (id: string) => publishCatalogEntry(id),
		onSuccess: async (saved) => {
			setFieldErrors({});
			setMessage("Wpis został opublikowany.");
			onSaved(saved);
			await refresh();
		},
		onError: (error) => {
			if (error instanceof CatalogApiError) setFieldErrors(error.fieldErrors);
		},
	});
	const unpublishMutation = useMutation({
		mutationFn: (id: string) => unpublishCatalogEntry(id),
		onSuccess: async (saved) => {
			setMessage("Wpis został wycofany do szkicu.");
			onSaved(saved);
			await refresh();
		},
	});
	const deleteMutation = useMutation({
		mutationFn: (id: string) => deleteCatalogEntry(id),
		onSuccess: async () => {
			onDeleted();
			await refresh();
		},
	});

	const form = useForm({
		defaultValues: formValues(entry),
		onSubmit: async ({ value }) => {
			setMessage(null);
			saveMutation.mutate(draftInput(value));
		},
	});

	const errorMessage =
		saveMutation.error ?? publishMutation.error ?? unpublishMutation.error ?? deleteMutation.error;
	const isPending =
		saveMutation.isPending ||
		publishMutation.isPending ||
		unpublishMutation.isPending ||
		deleteMutation.isPending;

	const publish = () => {
		if (!entry) return;
		const errors = getCatalogPublishFieldErrors(
			entry,
			new Date(),
			DEFAULT_TRANSFER_CATALOG_FRESHNESS_DAYS,
		);
		setFieldErrors(errors);
		if (Object.keys(errors).length === 0) publishMutation.mutate(entry.id);
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>{entry ? "Edytuj wpis" : "Nowy szkic"}</CardTitle>
				<CardDescription className="text-pretty">
					Szkic może być niekompletny. Wszystkie pola są sprawdzane przed publikacją.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				{entry?.freshness === "stale" && (
					<Alert variant="warning">
						<AlertTitle>Dane są nieaktualne</AlertTitle>
						<AlertDescription>
							Wpis nie trafi do rekomendacji, dopóki data kontroli nie zostanie odświeżona.
						</AlertDescription>
					</Alert>
				)}
				{message && (
					<Alert variant="success">
						<AlertDescription>{message}</AlertDescription>
					</Alert>
				)}
				{errorMessage && (
					<Alert variant="destructive">
						<AlertTitle>Nie udało się zapisać zmiany</AlertTitle>
						<AlertDescription>
							{errorMessage instanceof Error ? errorMessage.message : "Spróbuj ponownie."}
						</AlertDescription>
					</Alert>
				)}
				<form
					className="space-y-5"
					onSubmit={(event) => {
						event.preventDefault();
						form.handleSubmit();
					}}
				>
					<div className="grid gap-4 sm:grid-cols-2">
						{textFields.map((definition) => (
							<form.Field key={definition.name} name={definition.name}>
								{(field) => (
									<div className="space-y-1.5">
										<label className="text-sm font-medium" htmlFor={`catalog-${field.name}`}>
											{definition.label}
										</label>
										<Input
											id={`catalog-${field.name}`}
											value={field.state.value}
											onChange={(event) => field.handleChange(event.target.value)}
											aria-invalid={Boolean(fieldErrors[definition.name])}
										/>
										{fieldErrors[definition.name] && (
											<p className="text-sm text-destructive">{fieldErrors[definition.name]}</p>
										)}
									</div>
								)}
							</form.Field>
						))}
						{numberFields.map((definition) => (
							<form.Field key={definition.name} name={definition.name}>
								{(field) => (
									<div className="space-y-1.5">
										<label className="text-sm font-medium" htmlFor={`catalog-${field.name}`}>
											{definition.label}
										</label>
										<Input
											id={`catalog-${field.name}`}
											type="number"
											step="1"
											value={field.state.value}
											onChange={(event) => field.handleChange(event.target.value)}
											aria-invalid={Boolean(fieldErrors[definition.name])}
										/>
										{fieldErrors[definition.name] && (
											<p className="text-sm text-destructive">{fieldErrors[definition.name]}</p>
										)}
									</div>
								)}
							</form.Field>
						))}
						<form.Field name="checkedAt">
							{(field) => (
								<div className="space-y-1.5">
									<label className="text-sm font-medium" htmlFor="catalog-checkedAt">
										Data kontroli
									</label>
									<Input
										id="catalog-checkedAt"
										type="datetime-local"
										value={field.state.value}
										onChange={(event) => field.handleChange(event.target.value)}
										aria-invalid={Boolean(fieldErrors.checkedAt)}
									/>
									{fieldErrors.checkedAt && (
										<p className="text-sm text-destructive">{fieldErrors.checkedAt}</p>
									)}
								</div>
							)}
						</form.Field>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button type="submit" disabled={isPending}>
							<Save className="size-4" />
							Zapisz szkic
						</Button>
						{entry?.publicationStatus === "draft" && (
							<Button type="button" variant="secondary" disabled={isPending} onClick={publish}>
								<Send className="size-4" />
								Opublikuj
							</Button>
						)}
						{entry?.publicationStatus === "published" && (
							<Button
								type="button"
								variant="secondary"
								disabled={isPending}
								onClick={() => unpublishMutation.mutate(entry.id)}
							>
								<Archive className="size-4" />
								Wycofaj publikację
							</Button>
						)}
						{entry && (
							<Button
								type="button"
								variant="destructive"
								disabled={isPending}
								onClick={() => deleteMutation.mutate(entry.id)}
							>
								<Trash2 className="size-4" />
								Usuń
							</Button>
						)}
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

export function OperatorCatalogConsole() {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const entriesQuery = useQuery({ queryKey: catalogQueryKey, queryFn: listCatalogEntries });
	const selected = entriesQuery.data?.find((entry) => entry.id === selectedId) ?? null;

	if (entriesQuery.isLoading) return <output>Ładowanie katalogu…</output>;
	if (entriesQuery.error) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Brak dostępu do katalogu</AlertTitle>
				<AlertDescription>
					{entriesQuery.error instanceof Error
						? entriesQuery.error.message
						: "Nie udało się pobrać katalogu."}
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<section className="space-y-6" aria-labelledby="operator-catalog-title">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1
						id="operator-catalog-title"
						className="text-3xl font-semibold tracking-tight text-balance"
					>
						Katalog transferów z BGY
					</h1>
					<p className="mt-2 max-w-2xl text-muted-foreground text-pretty">
						Zarządzaj zweryfikowanymi połączeniami z lotniska Bergamo do Mediolanu.
					</p>
				</div>
				<Button type="button" variant="outline" onClick={() => setSelectedId(null)}>
					<Plus className="size-4" />
					Nowy szkic
				</Button>
			</div>
			<div className="grid gap-6 lg:grid-cols-[minmax(15rem,0.7fr)_minmax(0,1.3fr)]">
				<Card>
					<CardHeader>
						<CardTitle>Wpisy</CardTitle>
						<CardDescription>{entriesQuery.data?.length ?? 0} w katalogu</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						{entriesQuery.data?.length === 0 && (
							<p className="text-sm text-muted-foreground">Katalog nie zawiera jeszcze wpisów.</p>
						)}
						{entriesQuery.data?.map((entry) => (
							<button
								key={entry.id}
								type="button"
								aria-pressed={selectedId === entry.id}
								className="flex min-h-11 w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() => setSelectedId(entry.id)}
							>
								<Bus className="mt-0.5 size-4 shrink-0" />
								<span className="min-w-0 flex-1">
									<span className="block truncate font-medium">
										{entry.serviceName || "Szkic bez nazwy"}
									</span>
									<span className="mt-1 block text-xs text-muted-foreground">
										{statusLabel(entry)}
									</span>
								</span>
								{entry.freshness === "stale" && <Badge variant="warning">Nieaktualne</Badge>}
							</button>
						))}
					</CardContent>
				</Card>
				<CatalogEditor
					key={selected?.id ?? "new"}
					entry={selected}
					onSaved={(saved) => setSelectedId(saved.id)}
					onDeleted={() => setSelectedId(null)}
				/>
			</div>
		</section>
	);
}
