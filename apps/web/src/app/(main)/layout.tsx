import { Suspense } from "react";
import { BookHeader } from "@/components/book-header";
import { GameBubble } from "@/components/game-bubble";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingProvider>
      <div className="min-h-screen bg-background text-foreground">
        <Suspense
          fallback={<div className="h-[84px] border-b-[2.5px] border-foreground bg-background" />}
        >
          <BookHeader />
        </Suspense>
        {children}
        <GameBubble />
      </div>
    </OnboardingProvider>
  );
}
