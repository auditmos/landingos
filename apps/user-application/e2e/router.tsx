import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { EmailAuth } from "@/components/auth/email-auth";
import { FlightPlanner } from "@/components/flight/flight-planner";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { OperatorCatalogConsole } from "@/components/operator/operator-catalog-console";
import { FlightRoom } from "@/components/room/flight-room";
import { authClient } from "@/lib/auth-client";

const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

function RootShell() {
	return (
		<QueryClientProvider client={queryClient}>
			<Outlet />
		</QueryClientProvider>
	);
}

function AuthenticatedShell() {
	const session = authClient.useSession();
	const navigate = useNavigate();

	useEffect(() => {
		if (!session.isPending && !session.data) void navigate({ to: "/signin" });
	}, [navigate, session.data, session.isPending]);

	if (session.isPending) return <output aria-label="Ładowanie sesji">Ładowanie sesji…</output>;
	if (!session.data) return null;
	return (
		<div className="flex h-screen overflow-hidden bg-background">
			<Sidebar className="shrink-0" />
			<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
				<Header />
				<main className="flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6">
					<div className="mx-auto max-w-7xl">
						<Outlet />
					</div>
				</main>
			</div>
		</div>
	);
}

function DashboardFixture() {
	return (
		<section>
			<h1 className="text-3xl font-semibold">Panel podróżnego</h1>
			<p className="mt-2 text-muted-foreground">Zalogowano do izolowanej sesji testowej.</p>
		</section>
	);
}

const rootRoute = createRootRoute({ component: RootShell });
const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: FlightPlanner,
});
const signinRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/signin",
	component: EmailAuth,
});
const authenticatedRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: "_authenticated",
	component: AuthenticatedShell,
});
const appRoute = createRoute({
	getParentRoute: () => authenticatedRoute,
	path: "/app",
	component: FlightRoom,
});
const operatorRoute = createRoute({
	getParentRoute: () => authenticatedRoute,
	path: "/operator",
	component: OperatorCatalogConsole,
});
const dashboardRoute = createRoute({
	getParentRoute: () => authenticatedRoute,
	path: "/dashboard",
	component: DashboardFixture,
});
const routeTree = rootRoute.addChildren([
	indexRoute,
	signinRoute,
	authenticatedRoute.addChildren([appRoute, operatorRoute, dashboardRoute]),
]);

export function getE2ERouter() {
	return createRouter({ routeTree, defaultPreload: "intent" });
}
