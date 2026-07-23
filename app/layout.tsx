import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Inter is the product typeface (docs/spec.md v1 §4.2). latin-ext covers
// Uzbek Latin glyphs. Mono kept for tabular/code contexts.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Nashriyot-Master",
    template: "%s · Nashriyot-Master",
  },
  description: "Nashriyot ERP — nashriyot boshqaruv tizimi.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();
  return (
    <html lang="uz" suppressHydrationWarning>
      <body className={`${inter.variable} ${geistMono.variable} antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <TooltipProvider delay={200}>{children}</TooltipProvider>
        </NextIntlClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
