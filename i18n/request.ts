import { getRequestConfig } from "next-intl/server";
import messages from "@/dictionaries/uz.json";

// Single-locale setup (Uzbek Latin), no i18n routing — so it doesn't collide
// with the auth middleware.
export default getRequestConfig(async () => ({
  locale: "uz",
  messages,
}));
