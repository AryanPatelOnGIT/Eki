import type { ReactNode } from "react";
export function useBuses() { return { buses: [] }; }
export function useDrivers() { return { drivers: [] }; }
export function clearCollectionCache() {}
export function clearSettingsCache() {}
export function invalidateLiveBusCache() {}
export function usePathname() { return "/admin"; }
export function useRouter() { return { replace: () => {} }; }
export default function Link({ children, href }: { children: ReactNode; href: string }) { return <a href={href}>{children}</a>; }
