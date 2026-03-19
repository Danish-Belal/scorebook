import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "ScoreBook — Developer Intelligence Platform",
  description: "The fairest developer scoring platform. See where you rank across Codeforces, LeetCode, GitHub, and 6 more platforms.",
  openGraph: {
    title: "ScoreBook",
    description: "Developer scoring across all coding platforms",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans bg-[#080b14] text-white antialiased`}>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#f1f5f9",
            },
          }}
        />
      </body>
    </html>
  );
}
