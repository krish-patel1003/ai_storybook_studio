import Link from "next/link";
import { BookOpen } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="absolute left-6 top-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary chunky-border chunky-shadow-sm">
            <BookOpen className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </span>
          <span className="font-display text-2xl font-black tracking-tight">
            Storybook<span className="text-primary">.</span>Studio
          </span>
        </Link>
      </div>
      {children}
    </div>
  );
}
