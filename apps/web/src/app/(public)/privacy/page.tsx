import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — OlivianX",
  description: "How OlivianX collects, uses, and protects your information.",
};

// The shared (public) layout renders a header that uses useSearchParams(),
// which bails out of static generation — render this page dynamically instead.
export const dynamic = "force-dynamic";

const EFFECTIVE = "October 1, 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-4xl font-black">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {EFFECTIVE}</p>

      <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-foreground/90">
        <section className="space-y-3">
          <p>
            OlivianX (&ldquo;OlivianX&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is an AI tool that helps adults —
            parents, guardians, and educators — create personalized children&apos;s storybooks. This policy
            explains what we collect, why, and the choices you have. It is operated by [Legal Entity Name],
            and you can reach us at [contact email].
          </p>
        </section>

        <Section title="Information we collect">
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Account information</strong> — your email address, display name, and password (stored only as a secure hash).</li>
            <li><strong>Child profiles you create</strong> — a first name or nickname, age range, avatar, and interests that you enter to personalize stories. These are created and controlled by you, the adult account holder.</li>
            <li><strong>Content you create</strong> — story prompts, briefs, and the books, illustrations, and narration audio generated for you.</li>
            <li><strong>Voice recordings</strong> — if you use Voice Studio, audio you record or upload to create a narration voice.</li>
            <li><strong>Payment information</strong> — handled by our payment processor (Stripe). We receive your subscription status and the last four digits of your card, but never your full card number.</li>
            <li><strong>Usage &amp; technical data</strong> — log data, device/browser information, and basic analytics needed to operate and secure the service.</li>
          </ul>
        </Section>

        <Section title="How we use information">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>To generate your stories, illustrations, and narration, and to deliver the service.</li>
            <li>To manage your account, subscription, and page allowance.</li>
            <li>To keep the service safe — content safety filtering, abuse prevention, and security.</li>
            <li>To improve reliability and support you when you ask for help.</li>
          </ul>
          <p>
            We do <strong>not</strong> sell your personal information, and we do not use your private story
            content or child-profile details to train third-party foundation models.
          </p>
        </Section>

        <Section title="Children&apos;s privacy (COPPA)">
          <p>
            OlivianX is intended for use by adults. You must be 18 or older to create an account. Child
            profiles are created and managed by the adult account holder, and the information in them is
            provided by that adult — not collected from a child directly. We do not knowingly allow children
            under 13 to create accounts or provide personal information to us.
          </p>
          <p>
            If you believe a child has provided us personal information without the involvement of a parent or
            guardian, contact us at [contact email] and we will delete it.
          </p>
        </Section>

        <Section title="Service providers we share data with">
          <p>We use trusted processors to run OlivianX. They handle data only to provide their service to us:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li><strong>Google Cloud</strong> — hosting, database, and storage; <strong>Google Gemini</strong> — text and image generation.</li>
            <li><strong>ElevenLabs</strong> — optional voice cloning and narration.</li>
            <li><strong>Stripe</strong> — payment processing.</li>
            <li><strong>Vercel</strong> — web application hosting.</li>
          </ul>
        </Section>

        <Section title="Data retention">
          <p>
            We keep your account and content for as long as your account is active. You can delete individual
            books at any time, and you can ask us to delete your account and associated personal data by
            contacting [contact email]. Some records may be retained where required for legal, security, or
            accounting purposes.
          </p>
        </Section>

        <Section title="Security">
          <p>
            We protect data with encryption in transit, access controls, and secrets management. No system is
            perfectly secure, but we work to safeguard your information and promptly address issues we find.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Depending on where you live, you may have the right to access, correct, export, or delete your
            personal information, and to object to or restrict certain processing. To exercise these rights,
            contact [contact email]. We will respond within the timeframe required by applicable law.
          </p>
        </Section>

        <Section title="International transfers">
          <p>
            We operate on infrastructure located in the United States. If you access OlivianX from outside the
            US, your information will be processed in the US and other countries where our providers operate.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. When we make material changes, we will update the date
            above and, where appropriate, notify you. Continued use of OlivianX after an update means you accept
            the revised policy.
          </p>
        </Section>

        <Section title="Contact">
          <p>Questions about privacy? Email us at [contact email].</p>
        </Section>
      </div>

      <div className="mt-10 border-t border-foreground/10 pt-6 text-sm">
        <Link href="/terms" className="font-bold text-primary underline-offset-4 hover:underline">Terms of Service</Link>
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
