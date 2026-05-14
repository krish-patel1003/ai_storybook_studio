"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Sparkles, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type FormData = z.infer<typeof schema>;

export default function SignInPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, isMock } = useAuth();
  const router = useRouter();

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
      router.push("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
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
          <button
            type="button"
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-background px-4 py-3 font-extrabold chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5"
          >
            <GoogleIcon />
            Continue with Google
          </button>

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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
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
