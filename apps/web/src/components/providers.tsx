"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "@/lib/auth-context";
import { BookProvider } from "@/lib/book-store";
import { Toaster } from "@/components/ui/sonner";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BookProvider>
          {children}
          <Toaster position="bottom-right" richColors />
        </BookProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
