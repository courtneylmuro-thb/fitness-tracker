import type { Metadata, Viewport } from "next";
import "./globals.css";
import NavBar from "./nav-bar";
import PullToRefresh from "./pull-to-refresh";

export const metadata: Metadata = {
  title: "Fit",
  description: "Courtney's personal fitness & nutrition tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Fit",
  },
};

export const viewport: Viewport = {
  themeColor: "#F9F9F7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PullToRefresh />
        {children}
        <NavBar />
      </body>
    </html>
  );
}
