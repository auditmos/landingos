import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth")({
	component: RouteComponent,
});

function RouteComponent() {
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
	const session = authClient.useSession();
	const navigate = useNavigate();

	useEffect(() => {
		if (!session.isPending && !session.data) {
			navigate({ to: "/signin" });
		}
	}, [session.isPending, session.data, navigate]);

	if (session.isPending) {
		return (
			<output
				className="min-h-screen flex items-center justify-center bg-background"
				aria-label="Ładowanie sesji"
			>
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
			</output>
		);
	}

	if (!session.data) {
		return null;
	}

	return (
		<div className="flex h-screen bg-background overflow-hidden">
			<Sidebar className="flex-shrink-0" />

			<div className="flex flex-1 flex-col overflow-hidden">
				<Header onMobileMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />

				<main className="flex-1 overflow-y-auto bg-muted/20 p-6">
					<div className="mx-auto max-w-7xl">
						<Outlet />
					</div>
				</main>
			</div>
		</div>
	);
}
