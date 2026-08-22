"use client";
import { useListLessons } from "@/api-client";
import { BookOpen, ShieldAlert, Smartphone, Globe, Mail, MessageSquare, CircleCheck } from "lucide-react";
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
        description={
          lessons.some((l) => l.completed)
            ? `${lessons.filter((l) => l.completed).length} of ${lessons.length} read. Bite-sized guides to spot the latest tricks scammers are using.`
            : "Bite-sized guides to spot the latest tricks scammers are using."
        }
      />

      <ul className="grid sm:grid-cols-2 gap-4 lg:gap-6">
        {lessons.map((lesson, idx) => {
          const card = (
            <Card
              data-vector={lesson.vector}
              className="group border shadow-sm h-full overflow-hidden flex flex-col hover:shadow-md hover:border-primary transition-all"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <div className="flex flex-row h-full">
                <div className={`w-24 shrink-0 flex items-center justify-center border-r transition-colors ${VECTOR_SURFACE} group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary`}>
                  {getIconForVector(lesson.vector)}
                </div>
                <div className="flex-1 p-5">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h3 className="font-bold text-lg leading-tight group-hover:text-primary transition-colors">
                      {lesson.title}
                    </h3>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {/* Reading a lesson used to record nothing at all, so the
                          library looked identical however much you had done. */}
                      {lesson.completed && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-bold text-success">
                          <CircleCheck className="h-3 w-3" aria-hidden="true" />
                          Done
                        </span>
                      )}
                      <Badge variant="outline" className="capitalize text-xs font-bold shadow-none border-muted-foreground/30 text-muted-foreground">
                        {lesson.vector}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-muted-foreground text-sm font-medium line-clamp-2">
                    {lesson.summary}
                  </p>
                </div>
              </div>
            </Card>
          );

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