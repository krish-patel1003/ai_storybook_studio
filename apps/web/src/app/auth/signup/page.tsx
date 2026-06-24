"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, Sparkles, ArrowRight, Pencil } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "@/lib/auth-context";

const schema = z
  .object({
    username: z.string().min(2, "At least 2 characters").max(50, "Under 50 characters"),
    email: z.string().email("Enter a valid email address"),
    password: z
      .string()
      .min(8, "At least 8 characters")
      .regex(/[A-Z]/, "Must include an uppercase letter")
      .regex(/[0-9]/, "Must include a number"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

export default function SignUpPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { register: registerUser, googleLogin, isMock } = useAuth();
  const router = useRouter();

  async function handleGoogleCredential(credential: string) {
    try {
      await googleLogin(credential);
      toast.success("Account created! Welcome to Storybook Studio.");
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign up failed");
    }
  }

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const password = watch("password", "");

  async function onSubmit(data: FormData) {
    setIsLoading(true);
    try {
      await registerUser(data.username, data.email, data.password);
      if (isMock) {
        toast.success("Account created! Welcome to Storybook Studio.");
        router.push("/");
      } else {
        router.push(`/auth/check-email?email=${encodeURIComponent(data.email)}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-24">
      <div className="w-full max-w-md">

        {isMock && (
          <div className="mb-4 rounded-2xl border-[2px] border-dashed border-foreground/30 bg-highlight/50 px-4 py-2.5 text-center text-sm font-bold text-foreground/70">
            ✦ Mock mode — no backend needed. Fill in any details to test.
          </div>
        )}

        <div className="mb-8 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-highlight px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-foreground chunky-border">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={3} /> New author
          </span>
          <h1 className="mt-4 font-display text-4xl font-black md:text-5xl">
            Start your first story.
          </h1>
          <p className="mt-2 text-muted-foreground">Free to create. No credit card required.</p>
        </div>

        <div className="rounded-3xl bg-card p-8 chunky-border chunky-shadow">
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={({ credential }) => credential && handleGoogleCredential(credential)}
              onError={() => toast.error("Google sign up was cancelled or failed")}
              theme="outline"
              size="large"
              text="signup_with"
              width="368"
            />
          </div>

          <Divider />

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Field
              label="Username"
              hint="Your account username. You can set an author name separately."
              error={errors.username?.message}
            >
              <div className="relative">
                <input
                  {...register("username")}
                  type="text"
                  placeholder="e.g. jane_parent"
                  autoComplete="nickname"
                  className={inputClass(!!errors.username) + " pl-11"}
                />
                <Pencil className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </Field>

            <Field label="Email" error={errors.email?.message}>
              <input
                {...register("email")}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                className={inputClass(!!errors.email)}
              />
            </Field>

            <Field label="Password" error={errors.password?.message}>
              <div className="relative">
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
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
              {password.length > 0 && <PasswordStrength password={password} />}
            </Field>

            <Field label="Confirm password" error={errors.confirmPassword?.message}>
              <div className="relative">
                <input
                  {...register("confirmPassword")}
                  type={showConfirm ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className={inputClass(!!errors.confirmPassword) + " pr-12"}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            <p className="text-xs text-muted-foreground">
              By creating an account you agree to our{" "}
              <Link href="/terms" className="font-bold underline-offset-4 hover:underline">Terms</Link>
              {" "}and{" "}
              <Link href="/privacy" className="font-bold underline-offset-4 hover:underline">Privacy Policy</Link>.
            </p>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 font-extrabold text-primary-foreground chunky-border chunky-shadow-sm transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <span className="animate-pulse">Creating account…</span>
              ) : (
                <>Create account <ArrowRight className="h-4 w-4" strokeWidth={3} /></>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/auth/signin" className="font-extrabold text-foreground underline-offset-4 hover:underline">
            Sign in →
          </Link>
        </p>
      </div>
    </main>
  );
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const strength = checks.filter(Boolean).length;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  const colors = ["bg-destructive", "bg-destructive", "bg-highlight", "bg-secondary", "bg-accent"];

  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i < strength ? colors[strength] : "bg-muted"}`}
          />
        ))}
      </div>
      <p className="mt-1 text-xs font-bold text-muted-foreground">{labels[strength]}</p>
    </div>
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
  label, hint, error, children,
}: {
  label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5">
        <label className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">{label}</label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
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
