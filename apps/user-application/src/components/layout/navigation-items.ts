import { Bus, Home, MessageCircle, PlaneLanding, ShieldAlert } from "lucide-react";
import type { ComponentType } from "react";

export interface NavigationItem {
	name: string;
	icon: ComponentType<{ className?: string }>;
	href: string;
	badge?: string | number;
	/** Staff surface — hidden from travelers. */
	operatorOnly?: boolean;
	/** Customer surface — hidden from staff, who have no flight of their own. */
	travelerOnly?: boolean;
	indent?: boolean;
}

/**
 * The single navigation list. The desktop sidebar and the mobile header menu
 * both render from this — they used to keep separate copies, which is how the
 * operator report queue shipped reachable on desktop and invisible on mobile.
 */
const navigationItems: NavigationItem[] = [
	{
		name: "Start",
		icon: Home,
		href: "/",
	},
	{
		name: "Pokoje lotu",
		icon: MessageCircle,
		href: "/app",
		travelerOnly: true,
	},
	{
		name: "Moje loty",
		icon: PlaneLanding,
		href: "/app/flights",
		travelerOnly: true,
		indent: true,
	},
	{
		name: "Katalog transferów",
		icon: Bus,
		href: "/operator",
		operatorOnly: true,
	},
	{
		name: "Zgłoszenia",
		icon: ShieldAlert,
		href: "/operator/reports",
		operatorOnly: true,
		indent: true,
	},
];

export function visibleNavigationItems(viewer: {
	isOperator: boolean;
	openRoomCount: number;
}): NavigationItem[] {
	return navigationItems
		.filter((item) =>
			item.operatorOnly ? viewer.isOperator : !item.travelerOnly || !viewer.isOperator,
		)
		.map((item) =>
			item.href === "/app" && viewer.openRoomCount > 0
				? { ...item, badge: viewer.openRoomCount }
				: item,
		);
}
