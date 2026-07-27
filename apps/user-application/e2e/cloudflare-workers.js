const unavailableBinding = {
	fetch() {
		throw new Error("Cloudflare bindings are unavailable in the isolated browser fixture.");
	},
};

export const env = new Proxy(
	{},
	{
		get() {
			return unavailableBinding;
		},
	},
);
