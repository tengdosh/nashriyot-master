import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";

const BASEPATH = "/nashriyot-master";

// Edge-safe auth (no providers needed to *read* the JWT session).
const { auth } = NextAuth(authConfig);

// Route prefix → required permission code. Longest match wins.
const ROUTE_PERMISSIONS: [string, string][] = [
  ["/dashboard", "dashboard.read"],
  ["/titles", "titles.read"],
  ["/acquisitions", "acquisitions.read"],
  ["/production", "production.read"],
  ["/inventory", "inventory.read"],
  ["/sales", "sales.read"],
  ["/transfers", "transfers.read"],
  ["/entities", "transfers.read"],
  ["/contracts", "contracts.read"],
  ["/royalties", "royalty.read"],
  ["/leads", "leads.read"],
  ["/finance", "finance.read"],
  ["/costing", "costing.read"],
  ["/analytics", "analytics.read"],
  ["/ai", "ai.read"],
  ["/admin", "admin.users"],
];

export default auth((req) => {
  const { nextUrl } = req;
  // In this Turbopack/Edge build nextUrl.pathname includes the basePath prefix.
  // Strip it so all route checks below use clean paths ("/dashboard", etc.).
  const rawPath = nextUrl.pathname;
  const path = rawPath.startsWith(BASEPATH) ? rawPath.slice(BASEPATH.length) || "/" : rawPath;
  const user = req.auth?.user;
  const isLoggedIn = !!user;

  // Public: landing + login (api/auth is excluded by the matcher).
  if (path === "/" || path === "/login") return;

  // Author portal: only AUTHOR role.
  if (path.startsWith("/portal")) {
    if (!isLoggedIn) return redirectToLogin(nextUrl, path);
    if (!user!.roles?.includes("AUTHOR")) {
      return NextResponse.redirect(new URL(BASEPATH + "/login?error=forbidden", nextUrl));
    }
    return;
  }

  if (!isLoggedIn) return redirectToLogin(nextUrl, path);

  // Module route → permission.
  const match = ROUTE_PERMISSIONS.filter(
    ([prefix]) => path === prefix || path.startsWith(prefix + "/"),
  ).sort((a, b) => b[0].length - a[0].length)[0];

  if (match && !user!.permissions?.includes(match[1])) {
    // Authenticated but lacking permission → bounce to public landing (no loop).
    return NextResponse.redirect(new URL(BASEPATH + "/", nextUrl));
  }
  return;
});

function redirectToLogin(nextUrl: URL, callback: string) {
  const url = new URL(BASEPATH + "/login", nextUrl);
  url.searchParams.set("callbackUrl", BASEPATH + callback);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on everything except API routes, Next internals, the login page and static assets.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|login|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
