import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Saira } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

// Display face for headlines only: wide, italic, echoing the OCTANE logo.
const saira = Saira({
  variable: "--font-saira",
  subsets: ["latin"],
  style: ["italic"],
  axes: ["wdth"],
  display: "swap",
});

const description =
  "Self-hosted AI coding workspace for OpenCode with secure authentication, live sessions, file management, code diffs, terminal access, tasks and usage tracking.";
const appUrl = process.env.APP_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "OCTANE",
    template: "%s · OCTANE",
  },
  description,
  robots: { index: false, follow: false },
  applicationName: "OCTANE",
  openGraph: {
    title: "OCTANE",
    description,
    type: "website",
    siteName: "OCTANE",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "OCTANE",
    description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f1ef" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1918" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} ${saira.variable} h-full`}
    >
      <body className="min-h-full bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
