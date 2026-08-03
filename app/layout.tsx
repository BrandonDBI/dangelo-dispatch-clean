import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "D’Angelo Schedule",
  description: "D’Angelo Brothers dispatch board"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
