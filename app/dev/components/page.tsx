import { notFound } from "next/navigation";
import { ComponentsDemo } from "./components-demo";

// Dev-only gallery of the shared components (spec Task 4 §5).
export default function DevComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ComponentsDemo />;
}
