"use client";
import { useListLessons } from "@/api-client";
import { BookOpen, ShieldAlert, Smartphone, Globe, Mail, MessageSquare } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageShell } from "@/components/page-shell";
import { CardGridSkeleton, ErrorState, PageHeaderSkeleton } from "@/components/states";

const getIconForVector = (vector: string) => {
  switch (vector) {
    case 'email': return <Mail className="w-8 h-8" />;
    case 'sms': return <Smartphone className="w-8 h-8" />;
    case 'voice': return <MessageSquare className="w-8 h-8" />;
    case 'web': return <Globe className="w-8 h-8" />;
    default: return <ShieldAlert className="w-8 h-8" />;
  }
};

// Colour comes from the `data-vector` attribute + the vector tokens in
// globals.css, so light, dark and high-contrast are all handled centrally.
const VECTOR_SURFACE = "bg-vector-soft text-vector-fg border-vector-border";

export default function LearnPage() {
  const { data: lessons, isLoading, isError, refetch } = useListLessons();

  if (isLoading) {
    return (
      <PageShell>
        <PageHeaderSkeleton />
        <CardGridSkeleton count={6} />
      </PageShell>
    );
  }

  if (isError || !lessons) {
    return (
      <PageShell>
        <ErrorState
          title="Couldn't load the lesson library"
          description="The lessons didn't come back from the server."
          onRetry={() => refetch()}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        icon={BookOpen}
        title="Lesson library"
        description="Bite-sized guides to spot the latest tricks scammers are using."
      />

      <ul className="grid sm:grid-cols-2 gap-4 lg:gap-6">
        {lessons.map((lesson, idx) => {
          const isWip = lesson.vector !== "email" && lesson.vector !== "sms" && lesson.vector !== "voice";

          const card = (
            <Card
              data-vector={lesson.vector}
              className={`group border shadow-sm h-full overflow-hidden flex flex-col ${isWip ? "bg-muted/40" : "hover:shadow-md hover:border-primary transition-all"}`}
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <div className="flex flex-row h-full">
                <div className={`w-24 shrink-0 flex items-center justify-center border-r transition-colors ${VECTOR_SURFACE} ${isWip ? "opacity-70" : "group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary"}`}>
                  {getIconForVector(lesson.vector)}
                </div>
                <div className="flex-1 p-5">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h3 className={`font-bold text-lg leading-tight ${isWip ? "" : "group-hover:text-primary transition-colors"}`}>
                      {lesson.title}
                    </h3>
                    <Badge variant="outline" className={`capitalize text-xs font-bold shrink-0 shadow-none ${isWip ? "border-warning/40 text-warning" : "border-muted-foreground/30 text-muted-foreground"}`}>
                      {isWip ? "Coming soon" : lesson.vector}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm font-medium line-clamp-2">
                    {lesson.summary}
                  </p>
                </div>
              </div>
            </Card>
          );

          // Unreleased lessons: the old markup dimmed the whole card to 60%
          // opacity, which dragged the summary text under AA, and hung
          // aria-disabled on a plain <div> where it means nothing. Full-contrast
          // text on a muted surface carries "inactive" just as well, and the
          // state is announced rather than implied by colour alone.
          if (isWip) {
            return (
              <li key={lesson.id}>
                <span className="sr-only">{lesson.title} — coming soon, not yet available</span>
                <div aria-hidden>{card}</div>
              </li>
            );
          }

          return (
            <li key={lesson.id}>
              <Link href={`/learn/${lesson.id}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                {card}
              </Link>
            </li>
          );
        })}
      </ul>
    </PageShell>
  );
}