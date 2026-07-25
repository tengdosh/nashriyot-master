import { redirect } from "next/navigation";

/** /sales is just the orders screen — keep one canonical URL. */
export default function SalesIndexPage() {
  redirect("/sales/orders");
}
