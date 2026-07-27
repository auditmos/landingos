import { describe, expect, it } from "vitest";
import { containsCoordinate, MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";

describe("milan-municipality-v1", () => {
	it("locks the official City of Milan boundary extent as a Google-compatible rectangle", () => {
		expect(MILAN_MUNICIPALITY_VIEWPORT).toEqual({
			version: "milan-municipality-v1",
			rectangle: {
				low: {
					latitude: 45.38672482115768,
					longitude: 9.040613060914325,
				},
				high: {
					latitude: 45.53594676003435,
					longitude: 9.277997093231479,
				},
			},
			source: {
				publisher: "Comune di Milano",
				dataset: "Confini Amministrativi del Comune di Milano",
				url: "https://dati.comune.milano.it/dataset/ds2841-confini-amministrativi-del-comune-di-milano",
				resourceUrl:
					"https://dati.comune.milano.it/dataset/e75d91fa-eca6-4ee5-b96e-08bcdbb8d6f0/resource/f56cb432-83e6-48de-ae30-d39b4be61e85/download/confine_comune_milano_layer_0_confine_comune_milano.geojson",
				accessedOn: "2026-07-27",
				geometryPointCount: 19_553,
			},
		});
		expect(containsCoordinate({ latitude: 45.4642, longitude: 9.19 })).toBe(true);
		expect(containsCoordinate({ latitude: 45.6739, longitude: 9.7042 })).toBe(false);
		expect(containsCoordinate(MILAN_MUNICIPALITY_VIEWPORT.rectangle.low)).toBe(true);
		expect(containsCoordinate(MILAN_MUNICIPALITY_VIEWPORT.rectangle.high)).toBe(true);
	});

	it.each([
		[
			"below low latitude",
			{
				...MILAN_MUNICIPALITY_VIEWPORT.rectangle.low,
				latitude: MILAN_MUNICIPALITY_VIEWPORT.rectangle.low.latitude - 0.000000001,
			},
		],
		[
			"below low longitude",
			{
				...MILAN_MUNICIPALITY_VIEWPORT.rectangle.low,
				longitude: MILAN_MUNICIPALITY_VIEWPORT.rectangle.low.longitude - 0.000000001,
			},
		],
		[
			"above high latitude",
			{
				...MILAN_MUNICIPALITY_VIEWPORT.rectangle.high,
				latitude: MILAN_MUNICIPALITY_VIEWPORT.rectangle.high.latitude + 0.000000001,
			},
		],
		[
			"above high longitude",
			{
				...MILAN_MUNICIPALITY_VIEWPORT.rectangle.high,
				longitude: MILAN_MUNICIPALITY_VIEWPORT.rectangle.high.longitude + 0.000000001,
			},
		],
	])("rejects a point %s", (_label, coordinate) => {
		expect(containsCoordinate(coordinate)).toBe(false);
	});
});
