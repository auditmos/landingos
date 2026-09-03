// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { PolishPicker } from "./field-controls";

/*
 * Regression assumptions for the date-picker interaction:
 * - input: the traveler clicks the full-size native date input;
 * - output: browsers exposing `showPicker()` receive an explicit open request;
 * - boundary: browsers without `showPicker()` keep their native click behavior;
 * - excluded: rendering the browser-owned calendar surface inside jsdom.
 */
describe("PolishPicker", () => {
	it("opens the native picker when the traveler clicks the date field", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		await act(async () =>
			root.render(
				createElement(PolishPicker, {
					id: "departure-date",
					name: "departureLocalDate",
					label: "Data wylotu",
					type: "date",
					value: "2026-09-03",
					onChange: () => undefined,
				}),
			),
		);
		const input = container.querySelector<HTMLInputElement>("#departure-date-native");
		const showPicker = vi.fn();
		Object.defineProperty(input, "showPicker", { configurable: true, value: showPicker });

		await act(async () => input?.click());

		expect(showPicker).toHaveBeenCalledOnce();
		await act(async () => root.unmount());
		container.remove();
	});
});
