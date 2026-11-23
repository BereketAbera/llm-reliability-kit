import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Coach reliability kit",
    template: "%s · Coach reliability kit",
  },
  description:
    "How to make a live AI sales coach reliable: rate-limit safe retries, an answer bank that keeps approved lines word for word, a 30-question publish gate and monitoring. Fictional data, simulated provider.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} min-h-dvh font-sans antialiased`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow"
        >
          Skip to content
        </a>
        <TooltipProvider>
          <div className="flex min-h-dvh flex-col">
            <SiteHeader />
            <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-16 sm:px-6">
              {children}
            </main>
            <SiteFooter />
          </div>
        </TooltipProvider>
      </body>
    </html>
  );
}
