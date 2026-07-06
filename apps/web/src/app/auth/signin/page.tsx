"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Sparkles, ArrowRight } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "@/lib/auth-context";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormData = z.infer<typeof schema>;

export default function SignInPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, googleLogin, isMock } = useAuth();
  const router = useRouter();

  async function handleGoogleCredential(credential: string) {
    try {
      await googleLogin(credential);
      toast.success("Welcome back!");
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign in failed");
    }
  }

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  async function onSubmit(data: FormData) {
    setIsLoading(true);
    try {
      await login(data.email, data.password);
      toast.success("Welcome back!");
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-24">
      <div className="w-full max-w-md">

        {isMock && (
          <div className="mb-4 rounded-2xl border-[2px] border-dashed border-foreground/30 bg-highlight/50 px-4 py-2.5 text-center text-sm font-bold text-foreground/70">
            ✦ Mock mode — no backend needed. Any password works.
          </div>
        )}

        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-accent-foreground chunky-border">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={3} /> Welcome back
          </span>
          <h1 className="mt-4 font-display text-4xl font-black md:text-5xl">
            Your stories are waiting.
          </h1>
          <p className="mt-2 text-muted-foreground">
            Sign in to continue where you left off.
          </p>
        </div>

        <div className="rounded-3xl bg-card p-8 chunky-border chunky-shadow">
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={({ credential }) => credential && handleGoogleCredential(credential)}
              onError={() => toast.error("Google sign in was cancelled or failed")}
              theme="outline"
              size="large"
              text="signin_with"
              width="368"
            />
          </div>

          <Divider />

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field label="Email" error={errors.email?.message}>
              <input
                {...register("email")}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                className={inputClass(!!errors.email)}
              />
            </Field>

            <Field
              label="Password"
              error={errors.password?.message}
              action={
                <Link
                  href="/auth/forgot-password"
                  className="text-xs font-bold text-muted-foreground underline-offset-4 hover:underline"
                >
                  Forgot password?
                </Link>
              }
            >
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={inputClass(!!errors.password) + " pr-12"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 font-extrabold text-primary-foreground chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <span className="animate-pulse">Signing in…</span>
              ) : (
                <>Sign in <ArrowRight className="h-4 w-4" strokeWidth={3} /></>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" className="font-extrabold text-foreground underline-offset-4 hover:underline">
            Create one →
          </Link>
        </p>
      </div>
    </main>
  );
}

function Divider() {
  return (
    <div className="my-6 flex items-center gap-3">
      <div className="h-px flex-1 bg-foreground/15" />
      <span className="text-xs font-bold text-muted-foreground">or</span>
      <div className="h-px flex-1 bg-foreground/15" />
    </div>
  );
}

function Field({
  label, error, action, children,
}: {
  label: string; error?: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{label}</label>
        {action}
      </div>
      {children}
      {error && <p className="mt-1.5 text-xs font-bold text-destructive">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return [
    "w-full rounded-xl bg-background px-4 py-3 font-semibold outline-none chunky-border",
    "focus:ring-4 focus:ring-primary/25 transition-shadow",
    hasError ? "border-destructive ring-2 ring-destructive/20" : "",
  ].join(" ");
}
