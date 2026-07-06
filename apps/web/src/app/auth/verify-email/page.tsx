"use client";

import Link from "next/link";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { LgSpinner } from "@/components/character-spinner";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const router = useRouter();
  const { login: _login } = useAuth();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("This link is invalid or has expired.");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("No verification token found in the link.");
      return;
    }

    api.auth.verifyEmail(token)
      .then((result) => {
        // Store the tokens manually since we can't call `login` directly
        localStorage.setItem("sb_token", result.access_token);
        localStorage.setItem("sb_refresh", result.refresh_token);
        localStorage.setItem("sb_user", JSON.stringify(result.user));
        document.cookie = `sb_token=${result.access_token}; path=/; SameSite=Strict; max-age=${60 * 60 * 24 * 30}`;
        setStatus("success");
        // Redirect to home after short delay
        setTimeout(() => router.push("/"), 2500);
      })
      .catch((err) => {
        setStatus("error");
        if (err && typeof err === "object" && "detail" in err) {
          setErrorMsg(String(err.detail));
        } else if (err instanceof Error) {
          setErrorMsg(err.message);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-24">
      <div className="w-full max-w-md text-center">

        {status === "loading" && (
          <>
            <div className="mx-auto mb-6 flex justify-center">
              <LgSpinner />
            </div>
            <h1 className="font-display text-3xl font-black">Verifying your email…</h1>
            <p className="mt-3 text-muted-foreground">Just a moment!</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-accent chunky-border chunky-shadow">
              <CheckCircle className="h-10 w-10 text-accent-foreground" strokeWidth={2} />
            </div>
            <h1 className="font-display text-4xl font-black">Email verified!</h1>
            <p className="mt-3 text-muted-foreground text-lg">
              Welcome to Storybook.Studio. You&apos;re all set — redirecting you now…
            </p>
            <div className="mt-6">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-extrabold text-primary-foreground chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5"
              >
                ✦ Start writing your first story
              </Link>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-destructive/20 chunky-border chunky-shadow">
              <XCircle className="h-10 w-10 text-destructive" strokeWidth={2} />
            </div>
            <h1 className="font-display text-4xl font-black">Link expired</h1>
            <p className="mt-3 text-muted-foreground text-lg">{errorMsg}</p>

            <div className="mt-8 rounded-3xl bg-card p-6 chunky-border chunky-shadow text-left">
              <p className="text-sm font-bold mb-3">What to do next:</p>
              <ul className="space-y-2 text-sm text-muted-foreground mb-5">
                <li>✦ Verification links expire after 24 hours</li>
                <li>✦ Request a fresh link below</li>
              </ul>
              <Link
                href="/auth/check-email"
                className="flex w-full items-center justify-center rounded-2xl bg-foreground px-4 py-3 text-sm font-extrabold text-background chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5"
              >
                Request a new link
              </Link>
            </div>

            <Link
              href="/auth/signin"
              className="mt-6 inline-block text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back to sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><span style={{ animation: "char-jump 1.6s ease-in-out infinite", fontSize: "56px", display: "inline-block" }}>🦄</span></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
