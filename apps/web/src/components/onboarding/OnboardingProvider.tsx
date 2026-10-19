"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./onboarding.css";
import { useAuth } from "@/lib/auth-context";
import { TOUR_STEPS } from "@/lib/tour/steps";
import { WelcomeModal } from "./WelcomeModal";

// A tour "session" flag lives in sessionStorage so the chained tour keeps
// running as the user navigates from /create → /editor → /reader.
const TOUR_ACTIVE_KEY = "sb_tour_active";
const TOURED_ROUTES_KEY = "sb_toured_routes";
// Per-device "don't ask again" flag — a belt-and-suspenders gate so the welcome
// modal never re-nags even if the backend onboarding flag fails to persist.
const WELCOME_DISMISSED_KEY = "sb_welcome_dismissed";
// Persistent (per-device) record of which pages have already shown their
// one-time contextual tour, and a master switch the user controls.
const SEEN_PAGES_KEY = "sb_seen_pages";
const TOURS_ENABLED_KEY = "sb_tours_enabled";

interface OnboardingContextValue {
  /** Open the welcome modal (e.g. from the navbar "?" button). */
  openWelcome: () => void;
  /** Start the guided tour session on the current page. */
  startTour: () => void;
  /** Replay tips for the page the user is currently on (from the "?" button). */
  helpHere: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function getTouredRoutes(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(TOURED_ROUTES_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function getSeenPages(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_PAGES_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function markPageSeen(route: string): void {
  try {
    const seen = getSeenPages();
    seen.add(route);
    localStorage.setItem(SEEN_PAGES_KEY, JSON.stringify([...seen]));
  } catch {
    /* storage unavailable — contextual tour may re-show; harmless */
  }
}

function toursEnabled(): boolean {
  try {
    return localStorage.getItem(TOURS_ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

function setToursEnabled(on: boolean): void {
  try {
    localStorage.setItem(TOURS_ENABLED_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading, completeOnboarding } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const driverRef = useRef<Driver | null>(null);

  // Show the welcome modal once, on first authenticated visit.
  useEffect(() => {
    if (isLoading || !user) return;
    if (user.onboarding_completed) return;
    // Respect a prior dismissal on this device even if the server flag lags.
    if (typeof window !== "undefined" && localStorage.getItem(WELCOME_DISMISSED_KEY) === "1") return;
    // Don't interrupt the auth pages themselves.
    if (pathname.startsWith("/auth")) return;
    setWelcomeOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user?.id, user?.onboarding_completed]);

  const runTourForRoute = useCallback((route: string) => {
    const steps = TOUR_STEPS[route];
    if (!steps || steps.length === 0) return;
    // The first anchored step's target may not exist yet (e.g. the create page
    // shows a profile picker before the prompt/settings render). Wait for it so
    // the tour highlights real elements instead of showing centered boxes.
    const firstAnchor = steps.find((s) => s.element)?.element as string | undefined;

    // While waiting for the input page, show a hint on the profile picker so
    // the tour is never silent when it lands on "Who's creating today?".
    let hint: Driver | null = null;
    const clearHint = () => {
      hint?.destroy();
      hint = null;
    };

    const launch = () => {
      clearHint();
      driverRef.current?.destroy();
      const d = driver({
        showProgress: true,
        allowClose: true,
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Got it",
        steps,
        onDestroyed: () => {
          const toured = getTouredRoutes();
          toured.add(route);
          sessionStorage.setItem(TOURED_ROUTES_KEY, JSON.stringify([...toured]));
          // A route walked by the tour never needs its one-time contextual tour.
          markPageSeen(route);
        },
      });
      driverRef.current = d;
      d.drive();
    };

    let attempts = 0;
    const MAX_ATTEMPTS = 120; // ~60s at 500ms
    const waitThenLaunch = () => {
      if (firstAnchor && !document.querySelector(firstAnchor)) {
        // Guide the user through the profile picker while we wait for the form.
        if (!hint && document.querySelector('[data-tour="create-profile"]')) {
          hint = driver({
            allowClose: true,
            steps: [
              {
                element: '[data-tour="create-profile"]',
                popover: {
                  title: "Pick who's creating",
                  description:
                    "Choose a profile (or “Just me”) to start your story — the tour continues on the next screen.",
                },
              },
            ],
          });
          hint.drive();
        }
        if (attempts++ < MAX_ATTEMPTS) {
          setTimeout(waitThenLaunch, 500);
        } else {
          clearHint();
        }
        return;
      }
      launch();
    };
    waitThenLaunch();
  }, []);

  const startTour = useCallback(() => {
    sessionStorage.setItem(TOUR_ACTIVE_KEY, "1");
    sessionStorage.setItem(TOURED_ROUTES_KEY, "[]");
    if (pathname === "/create") {
      setTimeout(() => runTourForRoute("/create"), 150);
    } else {
      // Send the user to where the tour begins; the auto-run effect picks it up.
      router.push("/create");
    }
  }, [pathname, runTourForRoute, router]);

  // Chained tour: while a session is active, auto-run each page's steps the
  // first time the user lands there.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(TOUR_ACTIVE_KEY) !== "1") return;
    if (!TOUR_STEPS[pathname]) return;
    if (getTouredRoutes().has(pathname)) return;
    const t = setTimeout(() => runTourForRoute(pathname), 400);
    return () => clearTimeout(t);
  }, [pathname, runTourForRoute]);

  // Per-page contextual tour: the first time a signed-in user lands on any page
  // with steps, run them once (tracked per device). Skipped while the chained
  // onboarding session is driving, before onboarding is decided (the welcome
  // modal handles that), and when the user has turned tips off.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isLoading || !user) return;
    if (!user.onboarding_completed) return;
    if (!toursEnabled()) return;
    if (sessionStorage.getItem(TOUR_ACTIVE_KEY) === "1") return;
    if (pathname.startsWith("/auth")) return;
    if (!TOUR_STEPS[pathname]) return;
    if (getSeenPages().has(pathname)) return;
    // Mark seen immediately so a quick bounce doesn't queue it again; the run
    // itself is fire-and-forget and also marks seen on destroy.
    markPageSeen(pathname);
    const t = setTimeout(() => runTourForRoute(pathname), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, isLoading, user?.id, user?.onboarding_completed]);

  useEffect(() => () => driverRef.current?.destroy(), []);

  const openWelcome = useCallback(() => setWelcomeOpen(true), []);

  // "?" Help button: give help for the page the user is on. Pages in the tour
  // get their own tips replayed; anywhere else, open the welcome guide.
  const helpHere = useCallback(() => {
    if (TOUR_STEPS[pathname] && pathname !== "/create") {
      setToursEnabled(true);
      runTourForRoute(pathname);
    } else {
      setWelcomeOpen(true);
    }
  }, [pathname, runTourForRoute]);

  const handleStart = useCallback(() => {
    setWelcomeOpen(false);
    localStorage.setItem(WELCOME_DISMISSED_KEY, "1");
    setToursEnabled(true);
    completeOnboarding();
    startTour();
  }, [completeOnboarding, startTour]);

  const handleSkip = useCallback(() => {
    setWelcomeOpen(false);
    localStorage.setItem(WELCOME_DISMISSED_KEY, "1");
    // Turn off auto contextual tips too — a skip means "leave me alone".
    setToursEnabled(false);
    sessionStorage.removeItem(TOUR_ACTIVE_KEY);
    completeOnboarding();
  }, [completeOnboarding]);

  return (
    <OnboardingContext.Provider value={{ openWelcome, startTour, helpHere }}>
      {children}
      {welcomeOpen && <WelcomeModal onStart={handleStart} onSkip={handleSkip} />}
    </OnboardingContext.Provider>
  );
}

/** Returns the onboarding controls, or null when rendered outside the provider
 *  (e.g. the public layout). Callers should null-check. */
export function useOnboarding(): OnboardingContextValue | null {
  return useContext(OnboardingContext);
}
