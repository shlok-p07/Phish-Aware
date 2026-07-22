import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Shield,
  BookOpen,
  Target,
  BarChart3,
  Trophy,
  Mail,
  MessageSquare,
  Phone,
  QrCode,
  Users,
  Globe,
  ArrowRight,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getUserIdFromRequest } from "@/server/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "PhishAware — Train yourself to spot phishing" },
  description:
    "PhishAware is a gamified, hands-on training app that teaches you to recognize phishing across email, SMS, voice, QR codes, social media, and fake websites — all in a safe, simulated environment.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "PhishAware — Train yourself to spot phishing",
    description:
      "Learn to spot phishing through a gamified, simulated inbox. No real emails, links, or credentials involved.",
    url: "/",
    type: "website",
  },
};

const FEATURES = [
  {
    icon: BookOpen,
    title: "Bite-sized lessons",
    body: "Quick, focused guides that break down how each scam works and the exact cues that give it away.",
  },
  {
    icon: Target,
    title: "Realistic practice",
    body: "Judge simulated messages in a Gmail-like inbox, flag the red flags, and rate your confidence.",
  },
  {
    icon: BarChart3,
    title: "Personal analytics",
    body: "Track accuracy over time, see which cues you miss most, and measure how well-calibrated your instincts are.",
  },
  {
    icon: Trophy,
    title: "Measurable progress",
    body: "Track points, streaks, and milestones, and benchmark each person against their team as skills sharpen.",
  },
];

const VECTORS = [
  { icon: Mail, label: "Email" },
  { icon: MessageSquare, label: "SMS" },
  { icon: Phone, label: "Voice" },
  { icon: QrCode, label: "QR codes" },
  { icon: Users, label: "Social" },
  { icon: Globe, label: "Websites" },
];

const STEPS = [
  {
    step: "1",
    title: "Take a quick diagnostic",
    body: "A short quiz sets your starting difficulty so training meets you where you are.",
  },
  {
    step: "2",
    title: "Learn and practice",
    body: "Work through lessons, then test yourself against realistic simulated scams.",
  },
  {
    step: "3",
    title: "Watch your instincts sharpen",
    body: "Get instant feedback on every attempt and track your progress as you improve.",
  },
];

export default async function LandingPage() {
  // Signed-in users skip the marketing page and go straight to the app.
  const userId = await getUserIdFromRequest();
  if (userId !== null) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
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
        <section className="max-w-6xl mx-auto px-4 md:px-8 pt-16 md:pt-24 pb-16 text-center">
          <div className="inline-flex items-center gap-2 border border-border bg-muted/50 text-muted-foreground font-medium text-sm px-3.5 py-1.5 rounded-md mb-6">
            <Lock className="w-3.5 h-3.5 text-primary" />
            Fully simulated — no real emails, links, or credentials
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-[3.5rem] font-display font-bold tracking-tight max-w-4xl mx-auto leading-[1.08]">
            Security awareness training that measurably reduces risk
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mt-6 leading-relaxed">
            PhishAware gives your team hands-on practice against realistic,
            simulated attacks across every channel — and gives you the analytics
            to prove detection skills are improving.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-9">
            <Button
              asChild
              size="lg"
              className="font-semibold group w-full sm:w-auto"
            >
              <Link href="/auth">
                Get started
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="font-semibold w-full sm:w-auto"
            >
              <Link href="/auth">Try as a guest</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            No credit card required. Free to start.
          </p>
        </section>

        {/* Vectors */}
        <section className="max-w-6xl mx-auto px-4 md:px-8 pb-16">
          <p className="text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-6">
            Covering every angle attackers use
          </p>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 md:gap-4">
            {VECTORS.map((v) => (
              <div
                key={v.label}
                className="flex flex-col items-center gap-2 bg-card border border-border rounded-lg py-5 px-2"
              >
                <v.icon className="w-7 h-7 text-primary" />
                <span className="text-sm font-semibold">{v.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="bg-muted/40 border-y border-border">
          <div className="max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-20">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
                Everything you need to build real instincts
              </h2>
              <p className="text-muted-foreground text-lg font-medium mt-4">
                Not just a quiz — a full training loop that adapts to you.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 md:gap-6">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="bg-card border border-border rounded-lg p-6 md:p-8"
                >
                  <div className="inline-flex bg-primary/10 text-primary p-3 rounded-lg mb-4">
                    <f.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-display font-bold mb-2">
                    {f.title}
                  </h3>
                  <p className="text-muted-foreground font-medium leading-relaxed">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="max-w-6xl mx-auto px-4 md:px-8 py-16 md:py-20">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
              How it works
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <div key={s.step} className="text-center px-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary border border-primary/20 font-display font-bold text-xl flex items-center justify-center mx-auto mb-5">
                  {s.step}
                </div>
                <h3 className="text-xl font-bold mb-2">{s.title}</h3>
                <p className="text-muted-foreground font-medium leading-relaxed">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Trust / safety */}
        <section className="max-w-4xl mx-auto px-4 md:px-8 pb-16">
          <div className="bg-primary/5 border border-primary/20 rounded-lg p-8 md:p-10">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              <div className="bg-primary text-primary-foreground p-3 rounded-lg shrink-0">
                <Shield className="w-7 h-7" />
              </div>
              <div className="space-y-3">
                <h2 className="text-2xl font-display font-bold">
                  Safe by design
                </h2>
                <ul className="space-y-2">
                  {[
                    "Every scenario is simulated — nothing you interact with is real.",
                    "We never ask for real passwords, payment details, or account access.",
                    "Guest mode lets you try everything with zero commitment.",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <span className="font-medium text-foreground/90">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="max-w-6xl mx-auto px-4 md:px-8 pb-20">
          <div className="bg-primary text-primary-foreground rounded-lg px-6 py-14 md:py-16 text-center shadow-md">
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight max-w-2xl mx-auto">
              Ready to build a phishing-resistant team?
            </h2>
            <p className="text-primary-foreground/90 text-lg font-medium mt-4 max-w-xl mx-auto">
              Give your people realistic, measurable practice against the
              attacks they actually face.
            </p>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="font-semibold mt-8 group"
            >
              <Link href="/auth">
                Get started
                <ArrowRight className="w-5 h-5 ml-1 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Shield className="w-5 h-5" />
            <span className="font-display font-bold text-foreground">
              PhishAware
            </span>
          </div>
          <p className="text-sm text-muted-foreground font-medium">
            Built for learning. No real emails, links, or credentials involved.
          </p>
        </div>
      </footer>
    </div>
  );
}
