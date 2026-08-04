import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Bus, Home, Menu, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useViewerContext } from "@/lib/use-viewer";
import { cn } from "@/lib/utils";

interface NavigationItem {
	name: string;
	icon: React.ComponentType<{ className?: string }>;
	href: string;
	badge?: string | number;
	operatorOnly?: boolean;
}

const navigationItems: NavigationItem[] = [
	{
		name: "Start",
		icon: Home,
		href: "/",
	},
	{
		name: "Pokój lotu",
		icon: MessageCircle,
		href: "/app",
	},
	{
		name: "Katalog transferów",
		icon: Bus,
		href: "/operator",
		operatorOnly: true,
	},
];

interface SidebarProps {
	className?: string;
}

export function Sidebar({ className }: SidebarProps) {
	const navigate = useNavigate();
	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;
	const [isCollapsed, setIsCollapsed] = useState(false);
	const { isOperator } = useViewerContext();
	const visibleItems = navigationItems.filter((item) => !item.operatorOnly || isOperator);

	return (
		<>
			<div
				className={cn(
					"hidden lg:flex lg:flex-col lg:border-r lg:border-border lg:bg-sidebar",
					isCollapsed ? "lg:w-16" : "lg:w-64",
					className,
				)}
			>
				<div className="flex h-16 items-center justify-between border-b border-border px-4">
					{!isCollapsed && (
						<a
							className="flex items-center gap-2.5"
							href="/"
							aria-label="LandingOS — strona główna"
						>
							<img src="/landingos-icon.svg" alt="" className="size-8" width="32" height="32" />
							<span className="text-lg font-bold text-foreground">LandingOS</span>
						</a>
					)}
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setIsCollapsed(!isCollapsed)}
						className="size-9"
						aria-label={isCollapsed ? "Rozwiń menu" : "Zwiń menu"}
					>
						<Menu className="size-4 text-foreground" />
					</Button>
				</div>

				<ScrollArea className="flex-1 px-3 py-4">
					<nav className="space-y-2">
						{visibleItems.map((item) => {
							const isActive =
								currentPath === item.href ||
								(item.href !== "/" && currentPath.startsWith(`${item.href}/`));

							return (
								<Button
									key={item.name}
									variant={isActive ? "default" : "ghost"}
									className={cn(
										"min-h-11 w-full justify-start gap-3",
										isCollapsed && "px-2 justify-center",
										isActive && "bg-primary text-primary-foreground shadow-sm",
										!isActive && "text-muted-foreground hover:text-foreground hover:bg-accent",
									)}
									onClick={() => navigate({ to: item.href })}
								>
									<item.icon className="size-4 shrink-0" />
									{!isCollapsed && (
										<>
											<span className="truncate">{item.name}</span>
											{item.badge && (
												<span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
													{item.badge}
												</span>
											)}
										</>
									)}
								</Button>
							);
						})}
					</nav>
				</ScrollArea>
			</div>
			<div className="lg:hidden" />
		</>
	);
}
