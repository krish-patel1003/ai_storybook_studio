import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

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
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
