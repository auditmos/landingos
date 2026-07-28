import { createCsrfMiddleware, createStart } from "@tanstack/react-start";

declare module "@tanstack/react-start" {
	interface Register {
		server: {
			requestContext: {
				fromFetch: boolean;
			};
		};
	}
}

// Server functions are same-origin RPC endpoints; reject cross-site requests so
// a malicious page cannot invoke them with the user's cookies (CSRF).
const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => {
	return {
		defaultSsr: true,
		requestMiddleware: [csrfMiddleware],
	};
});

startInstance.createMiddleware().server(({ next }) => {
	return next({
		context: {
			fromStartInstanceMw: true,
		},
	});
});
