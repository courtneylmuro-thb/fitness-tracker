import type { Metadata, Viewport } from "next";
import "./globals.css";
import NavBar from "./nav-bar";

export const metadata: Metadata = {
  title: "Fitness Tracker",
  description: "Courtney's personal fitness & nutrition tracker",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Fitness",
  },
};

export const viewport: Viewport = {
  themeColor: "#fafafa",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <NavBar />
      </body>
    </html>
  );
}
