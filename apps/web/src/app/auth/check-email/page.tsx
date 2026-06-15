"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, RefreshCw, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleResend() {
    if (!email) return;
    setResending(true);
    try {
      await api.auth.resendVerification(email);
      setResent(true);
      toast.success("Verification email sent!");
    } catch {
      toast.error("Failed to resend. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-24">
      <div className="w-full max-w-md text-center">

        {/* Icon */}
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-highlight chunky-border chunky-shadow">
          <Mail className="h-10 w-10" strokeWidth={2} />
        </div>

        {/* Headline */}
        <h1 className="font-display text-4xl font-black md:text-5xl">Check your email</h1>
        <p className="mt-4 text-muted-foreground text-lg leading-relaxed">
          We sent a verification link to{" "}
          {email ? (
            <strong className="text-foreground">{email}</strong>
          ) : (
            "your email address"
          )}
          .<br />Click it to activate your account and start writing.
        </p>

        {/* Card */}
        <div className="mt-8 rounded-3xl bg-card p-6 chunky-border chunky-shadow text-left">
          <p className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-3">
            Didn&apos;t get it?
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground mb-5">
            <li>✦ Check your spam or promotions folder</li>
            <li>✦ The link expires in 24 hours</li>
            <li>✦ Make sure you used the right email</li>
          </ul>

          {resent ? (
            <div className="flex items-center gap-2 rounded-2xl bg-accent/50 px-4 py-3 font-bold text-sm chunky-border">
              ✦ A new link was sent! Check your inbox again.
            </div>
          ) : (
            <button
              onClick={handleResend}
              disabled={resending || !email}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-4 py-3 text-sm font-extrabold text-background chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 ${resending ? "animate-spin" : ""}`} strokeWidth={2.5} />
              {resending ? "Sending…" : "Resend verification email"}
            </button>
          )}
        </div>

        {/* Back link */}
        <Link
          href="/auth/signin"
          className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.5} />
          Back to sign in
        </Link>
      </div>
    </main>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>}>
      <CheckEmailContent />
    </Suspense>
  );
}
