import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { visibleNavigationItems } from "./navigation-items";

const names = (viewer: { isOperator: boolean; openRoomCount: number }) =>
	visibleNavigationItems(viewer).map((item) => item.name);

describe("navigation items", () => {
	it("hides every operator surface from travelers", () => {
		expect(names({ isOperator: false, openRoomCount: 0 })).toEqual([
			"Start",
			"Pokoje lotu",
			"Moje loty",
		]);
	});

	it("gives operators both consoles, including the report queue", () => {
		expect(names({ isOperator: true, openRoomCount: 0 })).toContain("Katalog transferów");
		expect(names({ isOperator: true, openRoomCount: 0 })).toContain("Zgłoszenia");
		const reports = visibleNavigationItems({ isOperator: true, openRoomCount: 0 }).find(
			(item) => item.name === "Zgłoszenia",
		);
		expect(reports?.href).toBe("/operator/reports");
	});

	it("badges the room list only when rooms are open", () => {
		const withRooms = visibleNavigationItems({ isOperator: false, openRoomCount: 3 });
		const without = visibleNavigationItems({ isOperator: false, openRoomCount: 0 });
		expect(withRooms.find((item) => item.href === "/app")?.badge).toBe(3);
		expect(without.find((item) => item.href === "/app")?.badge).toBeUndefined();
	});

	/**
	 * The report queue once shipped reachable on desktop and invisible on mobile
	 * because the header kept a second, hand-maintained copy of this list.
	 */
	it("is the only navigation list — neither shell declares its own", () => {
		for (const path of ["./sidebar.tsx", "./header.tsx"]) {
			const source = readFileSync(new URL(path, import.meta.url), "utf8");
			expect(source).toContain("visibleNavigationItems");
			expect(source).not.toMatch(/navigationItems\s*(?::\s*NavigationItem\[\])?\s*=\s*\[/);
			expect(source).not.toContain('href="/operator');
		}
	});
});
