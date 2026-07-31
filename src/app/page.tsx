import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Shield,
  BookOpen,
  Target,
  BarChart3,
  Trophy,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Gauge,
  Repeat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { InboxPreview } from "@/components/inbox-preview";
import { Reveal } from "@/components/reveal";
import { getUserIdFromRequest } from "@/server/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "PhishAware: Email phishing training that actually sticks" },
  description:
    "PhishAware trains employees to catch the phishing emails that get past filters, using realistic, fully simulated scenarios with instant feedback and analytics that prove detection skills are improving.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "PhishAware: Email phishing training that actually sticks",
    description:
      "Realistic, fully simulated phishing-email scenarios with instant feedback. No real emails, links, or credentials involved.",
    url: "/",
    type: "website",
  },
};

const WHY_EMAIL = [
  {
    icon: Sparkles,
    stat: "8",
    label: "real phishing cues",
    body: "The exact tell-tale signs attackers rely on: sender spoofing, urgency language, mismatched links, and more.",
  },
  {
    icon: Gauge,
    stat: "Instant",
    label: "feedback loop",
    body: "Every attempt is scored the moment it's submitted, with the specific cues caught and missed.",
  },
  {
    icon: Repeat,
    stat: "Personalized",
    label: "to your role",
    body: "Scenarios are shaped by your department and how you work, and get harder as your accuracy improves. Not one library everyone sees the same way.",
  },
];

const FEATURES = [
  {
    icon: BookOpen,
    title: "Lessons that build real pattern recognition",
    body: "Short, focused breakdowns of how each email scam works and the specific detail that gives it away. Not a generic slideshow.",
  },
  {
    icon: Target,
    title: "Scenarios that fit the job, not a generic library",
    body: "A Finance scenario leans on invoice fraud; IT gets fake help-desk requests. Every scenario plays out in a simulated inbox, judged the way it actually happens at work.",
  },
  {
    icon: BarChart3,
    title: "Analytics that hold up in a report",
    body: "Per-person and team-wide accuracy trends, broken down by which cues each person consistently misses.",
  },
  {
    icon: Trophy,
    title: "Progress people actually keep up with",
    body: "Streaks, levels, and a team leaderboard turn recurring training from a compliance checkbox into something people return to.",
  },
];

const STEPS = [
  {
    step: "1",
    title: "Take a 2-minute diagnostic",
    body: "A short quiz plus a few questions about your role set your starting difficulty and shape which scenarios you'll see.",
  },
  {
    step: "2",
    title: "Practice against scenarios built for you",
    body: "Work through lessons, then judge simulated phishing emails modeled on the tactics your role actually faces.",
  },
  {
    step: "3",
    title: "Watch the miss rate drop",
    body: "Every attempt comes with instant, specific feedback, so you can track improvement attempt by attempt.",
  },
];

export default async function LandingPage() {
  // Signed-in users skip the marketing page and go straight to the app.
  const userId = await getUserIdFromRequest();
  if (userId !== null) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-dvh flex flex-col relative">
      {/* Subtle fixed background wash so the glass surfaces (header, pill,
          footer, final CTA) have something soft to blur against. Small and
          low-opacity on purpose -- not a dominant colored block. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 right-[-10%] w-md h-112 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 rounded-full bg-primary/[0.07] blur-3xl" />
      </div>

      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/50 backdrop-blur-xl">
        <div className="max-w-6xl 2xl:max-w-[1680px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="bg-primary text-primary-foreground p-2 rounded-lg shadow-sm">
              <Shield className="w-6 h-6" />
            </div>
            <span className="text-xl font-display font-bold">PhishAware</span>
          </Link>
          <nav className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" className="font-semibold">
              <Link href="/auth">Log in</Link>
            </Button>
            <Button asChild className="font-semibold rounded-lg">
              <Link href="/auth">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-6xl 2xl:max-w-[1680px] mx-auto px-4 md:px-8 pt-16 md:pt-24 pb-16 md:pb-24">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <h1 className="text-4xl sm:text-5xl md:text-[3.25rem] font-display font-bold tracking-tight leading-[1.08]">
                Train your team to catch the phishing emails your filters miss
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mt-6 leading-relaxed">
                Spam filters catch most phishing emails. Your employees are
                the last line of defense against the ones that get through.
                PhishAware adapts every scenario to each person's role and
                department, so practice feels like the attacks they'd
                actually get, and gives you the data to prove detection
                skills are improving.
              </p>
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 mt-9">
                <Button asChild size="lg" className="font-semibold group w-full sm:w-auto">
                  <Link href="/auth">
                    Get started
                    <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="font-semibold w-full sm:w-auto">
                  <Link href="/auth">Try as a guest</Link>
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                No credit card required. Free to start.
              </p>
            </div>
            <div className="flex justify-center lg:justify-end">
              <InboxPreview />
            </div>
          </div>
        </section>

        {/* Why email, why this approach */}
        <section className="bg-muted/40 border-y border-border">
          <div className="max-w-6xl 2xl:max-w-[1680px] mx-auto px-4 md:px-8 py-16 md:py-20">
            <Reveal className="grid lg:grid-cols-[1fr_1.3fr] gap-10 lg:gap-16 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
                  Email is still the #1 way attackers get in
                </h2>
                <p className="text-muted-foreground text-lg font-medium mt-4">
                  So that's where PhishAware goes deep, instead of spreading
                  thin across every channel.
                </p>
              </div>
              <div className="space-y-3">
                {WHY_EMAIL.map((w) => (
                  <div
                    key={w.label}
                    className="flex items-start gap-4 bg-card border border-border rounded-lg p-5"
                  >
                    <div className="shrink-0 bg-primary/10 text-primary rounded-lg p-2.5">
                      <w.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-display font-bold">
                        <span className="text-lg">{w.stat}</span>{" "}
                        <span className="text-sm font-semibold text-muted-foreground">
                          {w.label}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                        {w.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* Features */}
        <section className="max-w-6xl 2xl:max-w-[1680px] mx-auto px-4 md:px-8 py-16 md:py-20">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
                Built to change behavior, not just check a box
              </h2>
              <p className="text-muted-foreground text-lg font-medium mt-4">
                Annual training videos don't change what people click on.
                Repeated, realistic practice does.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 md:gap-6">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-card border border-border rounded-lg p-6 md:p-8">
                  <div className="inline-flex bg-primary/10 text-primary p-3 rounded-lg mb-4">
                    <f.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-display font-bold mb-2">{f.title}</h3>
                  <p className="text-muted-foreground font-medium leading-relaxed">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* How it works */}
        <section className="bg-muted/40 border-y border-border">
          <div className="max-w-6xl 2xl:max-w-[1680px] mx-auto px-4 md:px-8 py-16 md:py-20">
            <Reveal>
              <div className="text-center max-w-2xl mx-auto mb-12">
                <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
                  How it works
                </h2>
              </div>
              <div className="grid md:grid-cols-3 gap-6 relative">
                <div
                  aria-hidden
                  className="hidden md:block absolute top-6 left-[16.5%] right-[16.5%] h-px bg-border"
                />
                {STEPS.map((s) => (
                  <div key={s.step} className="relative text-center px-4">
                    <div className="w-12 h-12 rounded-lg bg-primary text-primary-foreground font-display font-bold text-xl flex items-center justify-center mx-auto mb-5 shadow-sm">
                      {s.step}
                    </div>
                    <h3 className="text-xl font-bold mb-2">{s.title}</h3>
                    <p className="text-muted-foreground font-medium leading-relaxed">
                      {s.body}
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* Trust / safety */}
        <section className="max-w-4xl mx-auto px-4 md:px-8 py-16 md:py-20">
          <Reveal className="bg-primary/5 border border-primary/20 rounded-lg p-8 md:p-10">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              <div className="bg-primary text-primary-foreground p-3 rounded-lg shrink-0">
                <Shield className="w-7 h-7" />
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-display font-bold">Safe by design</h2>
                <ul className="space-y-2">
                  {[
                    "Every scenario is simulated. Nothing you interact with is real.",
                    "We never ask for real passwords, payment details, or account access.",
                    "Guest mode lets you try everything with zero commitment.",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <span className="font-medium text-foreground/90">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Reveal>
        </section>

        {/* Final CTA */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 pb-20">
          <Reveal className="rounded-2xl border border-primary/15 bg-primary/5 backdrop-blur-xl px-6 py-14 md:py-16 text-center shadow-sm">
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight max-w-2xl mx-auto">
              Give your team practice, not just a policy
            </h2>
            <p className="text-muted-foreground text-lg font-medium mt-4 max-w-xl mx-auto">
              Start free. See how your team performs against real phishing
              tactics, then add the analytics leadership can actually act on.
            </p>
            <Button asChild size="lg" className="font-semibold mt-8 group">
              <Link href="/auth">
                Get started
                <ArrowRight className="w-5 h-5 ml-1 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </Reveal>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 bg-background/50 backdrop-blur-xl">
        <div className="max-w-6xl 2xl:max-w-[1680px] mx-auto px-4 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Shield className="w-5 h-5" />
            <span className="font-display font-bold text-foreground">PhishAware</span>
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            Built for learning. No real emails, links, or credentials involved.
          </p>
        </div>
      </footer>
    </div>
  );
}
