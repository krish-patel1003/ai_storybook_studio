import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — OlivianX",
  description: "The terms that govern your use of OlivianX.",
};

// The shared (public) layout renders a header that uses useSearchParams(),
// which bails out of static generation — render this page dynamically instead.
export const dynamic = "force-dynamic";

const EFFECTIVE = "October 1, 2026";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-4xl font-black">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {EFFECTIVE}</p>

      <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-foreground/90">
        <section className="space-y-3">
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of OlivianX, operated by
            [Legal Entity Name] (&ldquo;OlivianX&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an
            account or using the service, you agree to these Terms. If you do not agree, do not use OlivianX.
          </p>
        </section>

        <Section title="Eligibility">
          <p>
            You must be at least 18 years old and able to form a binding contract to create an account. OlivianX
            is designed for adults creating storybooks for children; it is not intended for use by children
            directly.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            You are responsible for keeping your login credentials confidential and for all activity under your
            account. Tell us promptly at [contact email] if you suspect unauthorized use.
          </p>
        </Section>

        <Section title="Subscriptions, pages &amp; billing">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>OlivianX offers a free tier and paid plans. Paid plans are billed in advance on a recurring basis through our payment processor, Stripe.</li>
            <li>Each plan includes a monthly allowance of pages. Writing the pages of a book consumes pages from your allowance; covers are not counted. If a generation fails, the pages reserved for it are returned to your balance.</li>
            <li>You may purchase prepaid page packs (&ldquo;top-ups&rdquo;). Top-up pages are used after your monthly allowance and do not expire while your account is active.</li>
            <li>You can cancel at any time; your plan remains active until the end of the current billing period. Except where required by law, payments are non-refundable and unused monthly pages do not roll over.</li>
            <li>Prices and plan features may change; we will give notice of material changes before they take effect.</li>
          </ul>
        </Section>

        <Section title="Acceptable use">
          <p>You agree not to use OlivianX to create or distribute content that:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>is unlawful, harmful, or infringes the rights of others;</li>
            <li>depicts the sexualization of minors or other prohibited content;</li>
            <li>harasses, defames, or impersonates others; or</li>
            <li>attempts to disrupt, reverse engineer, or gain unauthorized access to the service.</li>
          </ul>
          <p>We may use automated safety filtering and may remove content or suspend accounts that violate these Terms.</p>
        </Section>

        <Section title="Your content and ownership">
          <p>
            You retain ownership of the prompts and other inputs you provide. As between you and us, you own the
            storybooks, illustrations, and narration generated for you, subject to the rights of our AI providers
            and applicable law. You grant us a limited license to store, process, and display your content solely
            to operate and provide the service to you.
          </p>
          <p>
            <strong>About AI-generated content:</strong> output is produced by AI models and is provided
            &ldquo;as is.&rdquo; Similar prompts may yield similar results for other users, and the legal status
            of AI-generated works (including copyright) varies by jurisdiction and may be limited. You are
            responsible for reviewing content before publishing or printing it, including through third parties
            such as Amazon KDP, and for complying with their terms.
          </p>
        </Section>

        <Section title="Our intellectual property">
          <p>
            OlivianX, including its software, branding, and design, is owned by us and protected by law. These
            Terms do not grant you any right to our trademarks or to the service beyond the limited right to use
            it as permitted here.
          </p>
        </Section>

        <Section title="Disclaimers">
          <p>
            The service is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without warranties of any
            kind, whether express or implied, to the fullest extent permitted by law. We do not warrant that the
            service will be uninterrupted, error-free, or that generated content will meet your expectations.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, OlivianX will not be liable for any indirect, incidental,
            special, consequential, or punitive damages, or for any loss of data, profits, or goodwill. Our total
            liability for any claim relating to the service will not exceed the amount you paid us in the 12
            months before the claim.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            You may stop using OlivianX and delete your account at any time. We may suspend or terminate access
            if you violate these Terms or where necessary to protect the service or other users. Provisions that
            by their nature should survive termination will survive.
          </p>
        </Section>

        <Section title="Governing law">
          <p>
            These Terms are governed by the laws of [governing jurisdiction], without regard to its conflict-of-law
            rules. Disputes will be resolved in the courts located there, unless applicable law provides otherwise.
          </p>
        </Section>

        <Section title="Changes to these Terms">
          <p>
            We may update these Terms from time to time. When we make material changes, we will update the date
            above and, where appropriate, notify you. Continued use after an update means you accept the revised
            Terms.
          </p>
        </Section>

        <Section title="Contact">
          <p>Questions about these Terms? Email us at [contact email].</p>
        </Section>
      </div>

      <div className="mt-10 border-t border-foreground/10 pt-6 text-sm">
        <Link href="/privacy" className="font-bold text-primary underline-offset-4 hover:underline">Privacy Policy</Link>
        <span className="mx-2 text-muted-foreground">·</span>
        <Link href="/" className="font-bold text-primary underline-offset-4 hover:underline">Back to OlivianX</Link>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl font-black">{title}</h2>
      {children}
    </section>
  );
}
