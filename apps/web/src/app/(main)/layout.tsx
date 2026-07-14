import { BookHeader } from "@/components/book-header";
import { OnboardingProvider } from "@/components/onboarding/OnboardingProvider";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnboardingProvider>
      <div className="min-h-screen bg-background text-foreground">
        <BookHeader />
        {children}
      </div>
    </OnboardingProvider>
  );
}
