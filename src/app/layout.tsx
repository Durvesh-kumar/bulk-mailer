import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SecurityShield from "@/components/SecurityShield";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "InboxFlow",
  description:
    "Streamline B2B cold outreach with automated multi-account rotation, smart delay scheduling, and high inbox delivery rates.",
  keywords: [
    "Cold Outreach",
    "Email Rotator",
    "Multi-Account Sender",
    "Inbox Delivery",
    "B2B Email Automation",
  ],
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <SecurityShield />
      </body>
    </html>
  );
}
