import type { Metadata } from "next";
import { Unkempt, Kranky } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const unkempt = Unkempt({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-unkempt",
  display: "swap",
});

const kranky = Kranky({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-kranky",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Storybook Studio — Turn one idea into a children's book",
  description:
    "AI storybook studio that turns a single prompt into a consistent, illustrated, publish-ready children's book.",
  openGraph: {
    title: "Storybook Studio",
    description: "Turn one idea into a children's book.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${unkempt.variable} ${kranky.variable}`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
