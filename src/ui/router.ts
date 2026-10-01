import { useEffect, useState } from "react";

/** Minimal hash router — keeps the app deployable as static files. */
export type Route = "find" | "wallet" | "deals" | "history" | "settings" | "admin";
const ROUTES: Route[] = ["find", "wallet", "deals", "history", "settings", "admin"];

function parse(): { route: Route; sub?: string } {
  const [route, sub] = location.hash.replace(/^#\/?/, "").split("/");
  return { route: (ROUTES as string[]).includes(route) ? (route as Route) : "find", sub };
}

export function useRoute() {
  const [state, setState] = useState(parse);
  useEffect(() => {
    const on = () => {
      setState(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return state;
}

export function navigate(route: Route, sub?: string) {
  location.hash = `/${route}${sub ? `/${sub}` : ""}`;
}
