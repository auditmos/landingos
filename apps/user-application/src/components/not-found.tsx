import { Link } from "@tanstack/react-router";
import { ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NotFound({ children }: { children?: React.ReactNode }) {
	return (
		<div className="flex min-h-[60vh] items-center justify-center p-4">
			<div className="w-full max-w-md border border-foreground bg-card text-card-foreground shadow-press">
				<div className="flex items-center justify-between gap-4 border-b border-foreground px-6 py-4">
					<p className="text-xs font-bold uppercase text-muted-foreground">Błąd 404</p>
					<img src="/landingos-icon.svg" alt="" className="size-7" width="28" height="28" />
				</div>
				<div className="px-6 py-8 text-center">
					<h1 className="text-balance font-serif text-3xl font-medium text-foreground">
						Ta strona nie istnieje
					</h1>
					<div className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
						{children || <p>Strona, której szukasz, nie istnieje albo została przeniesiona.</p>}
					</div>
					<div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
						<Button onClick={() => window.history.back()} className="gap-2">
							<ArrowLeft className="size-4" aria-hidden="true" />
							Wróć
						</Button>
						<Button variant="outline" asChild>
							<Link to="/" className="gap-2">
								<Home className="size-4" aria-hidden="true" />
								Strona główna
							</Link>
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
