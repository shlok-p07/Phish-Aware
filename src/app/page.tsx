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
  Bot,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { InboxPreview } from "@/components/inbox-preview";
import { Reveal } from "@/components/reveal";
import { getUserIdFromRequest } from "@/server/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "PhishAware" },
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
    label: "phishing cues",
    body: "The tell-tale signs attackers count on: spoofed senders, urgency, mismatched links, and more.",
  },
  {
    icon: Gauge,
    stat: "Instant",
    label: "feedback loop",
    body: "Each attempt is scored the moment it's submitted, cue by cue, caught or missed.",
  },
  {
    icon: Repeat,
    stat: "Personalized",
    label: "to your role",
    body: "Scenarios track your department, and difficulty rises with your accuracy. No two people work through the same set.",
  },
];

const FEATURES = [
  {
    icon: Bot,
    title: "Scenarios generated in real time by Groq and Gemini",
    body: "Groq handles day-to-day generation for speed; Gemini takes over automatically if needed, so training never stalls. Nothing comes from a fixed template library.",
  },
  {
    icon: BookOpen,
    title: "Lessons built around pattern recognition, not policy",
    body: "Short, specific breakdowns of how a scam works and the one detail that gives it away. No slideshows, no filler.",
  },
  {
    icon: Target,
    title: "Scenarios shaped by the job",
    body: "Finance sees invoice fraud. IT sees fake help-desk requests. Each one plays out in a simulated inbox, judged the way it happens at work.",
  },
  {
    icon: BarChart3,
    title: "Analytics built for a leadership report",
    body: "Individual and team-wide accuracy trends, broken down by the specific cues each person misses.",
  },
  {
    icon: Trophy,
    title: "Progress people want to keep up with",
    body: "Streaks, levels, and a team leaderboard turn recurring training into something people return to, not a box to check.",
  },
  {
    icon: TrendingUp,
    title: "Sharper the longer your team uses it",
    body: "Results feed directly into your organization's own risk profile, not an industry average. Within months, PhishAware knows precisely where your team is exposed, and keeps adjusting to close it.",
  },
];

const STEPS = [
  {
    step: "1",
    title: "Take a 2-minute diagnostic",
    body: "A short quiz and a few questions about your role set your starting difficulty and shape what you'll see first.",
  },
  {
    step: "2",
    title: "Practice against scenarios built for you",
    body: "Work through lessons, then judge simulated phishing emails modeled on the tactics your role faces most.",
  },
  {
    step: "3",
    title: "Watch the miss rate drop",
    body: "Each attempt comes back with specific feedback, so improvement shows up attempt by attempt, not once a year.",
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
                Spam filters stop most phishing attempts before they reach an
                inbox. The ones that get through are built to fool a person,
                not a filter. PhishAware trains your team on exactly that:
                scenarios matched to each person's role, scored the moment
                they respond, with the data to prove your team is getting
                sharper.
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
                {WHY_EMAIL.map((w, i) => (
                  <Reveal key={w.label} delayMs={i * 80}>
                    <div className="group flex items-start gap-4 bg-card border border-border rounded-lg p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/30">
                      <div className="shrink-0 bg-primary/10 text-primary rounded-lg p-2.5 transition-transform duration-300 group-hover:scale-110">
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
                  </Reveal>
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
                Practice changes behavior. A slideshow doesn't.
              </h2>
              <p className="text-muted-foreground text-lg font-medium mt-4">
                Annual training videos don't change what people click on.
                Repeated, realistic practice does.
              </p>
            </div>
          </Reveal>
          <div className="grid sm:grid-cols-2 gap-4 md:gap-6">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delayMs={(i % 2) * 90}>
                <div className="group bg-card border border-border rounded-lg p-6 md:p-8 h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-primary/30">
                  <div className="inline-flex bg-primary/10 text-primary p-3 rounded-lg mb-4 transition-transform duration-300 group-hover:scale-110">
                    <f.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-display font-bold mb-2">{f.title}</h3>
                  <p className="text-muted-foreground font-medium leading-relaxed">
                    {f.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
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
                {STEPS.map((s, i) => (
                  <Reveal key={s.step} delayMs={i * 100} className="relative text-center px-4">
                    <div className="w-12 h-12 rounded-lg bg-primary text-primary-foreground font-display font-bold text-xl flex items-center justify-center mx-auto mb-5 shadow-sm transition-transform duration-300 hover:scale-110">
                      {s.step}
                    </div>
                    <h3 className="text-xl font-bold mb-2">{s.title}</h3>
                    <p className="text-muted-foreground font-medium leading-relaxed">
                      {s.body}
                    </p>
                  </Reveal>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* Trust / safety + final CTA, side by side */}
        <section className="max-w-6xl 2xl:max-w-[1680px] mx-auto px-4 md:px-8 py-16 md:py-20">
          <Reveal className="grid lg:grid-cols-2 gap-6 items-stretch">
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-8 md:p-10 flex flex-col transition-all duration-300 hover:shadow-md hover:border-primary/30">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-primary text-primary-foreground p-2.5 rounded-lg shrink-0">
                  <Shield className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-display font-bold">Safe by design</h2>
              </div>
              <div className="space-y-4">
                {[
                  "Every scenario is simulated. Nothing you interact with is real.",
                  "We never ask for real passwords, payment details, or account access.",
                  "Guest mode lets you try everything with zero commitment.",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span className="font-medium text-foreground/90">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-primary/15 bg-primary/5 backdrop-blur-xl p-8 md:p-10 shadow-sm flex flex-col justify-center transition-all duration-300 hover:shadow-lg hover:border-primary/25">
              <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tight">
                Give your team practice, not just a policy
              </h2>
              <p className="text-muted-foreground font-medium mt-4">
                Start free. See how your team performs against real phishing
                tactics, then add the analytics leadership can act on.
              </p>
              <Button asChild size="lg" className="font-semibold group mt-6 w-fit">
                <Link href="/auth">
                  Get started
                  <ArrowRight className="w-5 h-5 ml-1 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
            </div>
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
