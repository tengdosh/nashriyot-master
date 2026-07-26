import { redirect } from "next/navigation";

// The root just routes into the app: middleware sends an unauthenticated visitor
// to /login and an authenticated one on to their dashboard.
export default function Home() {
  redirect("/dashboard");
}
