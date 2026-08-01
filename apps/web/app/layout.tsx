import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Nav } from "./nav";

export const metadata: Metadata = {
  title: "Agent Console",
  description: "Control panel for Claude Code agents running on your server",
  // iOS ignores the manifest for both of these: without them an installed app
  // gets a screenshot for an icon and a browser chrome it cannot escape.
  appleWebApp: { capable: true, title: "Agents", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

// Nothing here is static: every page reads SQLite and live session state, and
// prerendering would run config parsing at build time, where no env exists.
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-3xl px-4 py-6">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
