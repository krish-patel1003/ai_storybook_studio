import { BookHeader } from "@/components/book-header";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <BookHeader />
      {children}
    </div>
  );
}
