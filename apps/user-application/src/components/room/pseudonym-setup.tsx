import { PseudonymSchema } from "@repo/data-ops/identity";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function PseudonymSetup({ onSaved }: { onSaved: () => void }) {
	const [pseudonym, setPseudonym] = useState("");
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		const parsed = PseudonymSchema.safeParse(pseudonym);
		if (!parsed.success) {
			setError(parsed.error.issues[0]?.message ?? "Wpisz prawidłowy pseudonim.");
			return;
		}
		setPending(true);
		setError("");
		try {
			const response = await fetch("/api/profile", {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ action: "pseudonym", pseudonym: parsed.data }),
			});
			if (!response.ok) throw new Error("profile");
			onSaved();
		} catch {
			setError("Nie udało się zapisać pseudonimu. Spróbuj ponownie.");
		} finally {
			setPending(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Ustaw pseudonim</CardTitle>
				<CardDescription>Inne osoby nie zobaczą Twojego adresu e-mail.</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-3" onSubmit={submit}>
					<label className="block text-sm font-medium" htmlFor="room-pseudonym">
						Pseudonim
					</label>
					<Input
						id="room-pseudonym"
						value={pseudonym}
						onChange={(event) => setPseudonym(event.target.value)}
						autoComplete="nickname"
					/>
					{error ? <p className="text-sm text-destructive">{error}</p> : null}
					<Button type="submit" disabled={pending}>
						{pending ? "Zapisywanie…" : "Zapisz i wejdź do pokoju"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
