import type { Metadata } from "next";
import {
  Unkempt, Kranky, Nunito, Patrick_Hand,
  Caveat, Merriweather, Quicksand, Mochiy_Pop_One,
} from "next/font/google";
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

const nunito = Nunito({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

const patrickHand = Patrick_Hand({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-patrick-hand",
  display: "swap",
});

const caveat = Caveat({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

const merriweather = Merriweather({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-merriweather",
  display: "swap",
});

const quicksand = Quicksand({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-quicksand",
  display: "swap",
});

const mochibop = Mochiy_Pop_One({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-mochibop",
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
      <body className={[
        unkempt.variable, kranky.variable, nunito.variable,
        patrickHand.variable, caveat.variable, merriweather.variable,
        quicksand.variable, mochibop.variable,
      ].join(" ")}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
