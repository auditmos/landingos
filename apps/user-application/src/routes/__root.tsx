/// <reference types="vite/client" />

import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import type * as React from "react";
import { DefaultCatchBoundary } from "@/components/default-catch-boundary";
import { NotFound } from "@/components/not-found";
import { ThemeProvider } from "@/components/theme";
import appCss from "@/styles.css?url";
import { seo } from "@/utils/seo";

export const Route = createRootRouteWithContext<{
	queryClient: QueryClient;
}>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			...seo({
				title: "LandingOS | Zaplanuj przejazd do Mediolanu",
				description:
					"Zaplanuj przejazd z lotniska do celu w Mediolanie i skontaktuj się z osobami z tego samego lotu.",
			}),
		],
		links: [
			{ rel: "stylesheet", href: appCss },
			{ rel: "icon", type: "image/svg+xml", href: "/landingos-icon.svg" },
			{
				rel: "apple-touch-icon",
				sizes: "192x192",
				href: "/icon-192.png",
			},
			{ rel: "manifest", href: "/manifest.json" },
			{ rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
		],
	}),
	errorComponent: (props) => {
		return (
			<RootDocument>
				<DefaultCatchBoundary {...props} />
			</RootDocument>
		);
	},
	notFoundComponent: () => <NotFound />,
	component: RootComponent,
});

function RootComponent() {
	return (
		<RootDocument>
			<ThemeProvider
				attribute="class"
				defaultTheme="system"
				enableSystem
				disableTransitionOnChange={false}
			>
				<Outlet />
			</ThemeProvider>
		</RootDocument>
	);
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="pl">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<TanStackRouterDevtools position="bottom-right" />
				<ReactQueryDevtools buttonPosition="bottom-left" />
				<Scripts />
			</body>
		</html>
	);
}
