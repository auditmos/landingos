import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ClosedRoom() {
	return (
		<Card className="mx-auto max-w-xl">
			<CardHeader>
				<CardTitle>Pokój został zamknięty</CardTitle>
				<CardDescription>
					Minęły 24 godziny od planowanego lądowania. Pokój nie jest już dostępny.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button asChild>
					<a href="/">Wróć do planera</a>
				</Button>
			</CardContent>
		</Card>
	);
}
