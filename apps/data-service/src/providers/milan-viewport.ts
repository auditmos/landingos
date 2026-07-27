export interface Coordinate {
	latitude: number;
	longitude: number;
}

export const MILAN_MUNICIPALITY_VIEWPORT = {
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
} as const;

export function containsCoordinate(coordinate: Coordinate): boolean {
	const { low, high } = MILAN_MUNICIPALITY_VIEWPORT.rectangle;
	return (
		coordinate.latitude >= low.latitude &&
		coordinate.latitude <= high.latitude &&
		coordinate.longitude >= low.longitude &&
		coordinate.longitude <= high.longitude
	);
}
