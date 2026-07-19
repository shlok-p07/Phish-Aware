"use client";
import { useListLessons } from "@/api-client";
import { BookOpen, ShieldAlert, Smartphone, Globe, Mail, MessageSquare } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const getIconForVector = (vector: string) => {
  switch (vector) {
    case 'email': return <Mail className="w-8 h-8" />;
    case 'sms': return <Smartphone className="w-8 h-8" />;
    case 'voice': return <MessageSquare className="w-8 h-8" />;
    case 'website': return <Globe className="w-8 h-8" />;
    default: return <ShieldAlert className="w-8 h-8" />;
  }
};

const getColorsForVector = (vector: string) => {
  switch (vector) {
    case 'email': return "bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-900/40 dark:text-blue-400 dark:border-blue-800";
    case 'sms': return "bg-green-100 text-green-600 border-green-200 dark:bg-green-900/40 dark:text-green-400 dark:border-green-800";
    case 'voice': return "bg-purple-100 text-purple-600 border-purple-200 dark:bg-purple-900/40 dark:text-purple-400 dark:border-purple-800";
    case 'website': return "bg-orange-100 text-orange-600 border-orange-200 dark:bg-orange-900/40 dark:text-orange-400 dark:border-orange-800";
    default: return "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/40 dark:text-slate-400 dark:border-slate-700";
  }
};

export default function LearnPage() {
  const { data: lessons, isLoading, isError } = useListLessons();

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto animate-pulse">
        <div className="h-24 bg-muted rounded-3xl" />
        <div className="grid md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !lessons) {
    return (
      <Card className="max-w-5xl mx-auto border-2 border-destructive/20 bg-destructive/5">
        <CardContent className="pt-6">
          <p className="text-destructive font-medium text-center">Failed to load lessons.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-3">
        <div className="inline-flex bg-primary/10 p-4 rounded-full mb-2 text-primary">
          <BookOpen className="w-8 h-8" />
        </div>
        <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">Lesson Library</h1>
        <p className="text-muted-foreground text-lg font-medium">Bite-sized guides to spot the latest tricks scammers are using.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-2 gap-4 lg:gap-6 mt-8">
        {lessons.map((lesson, idx) => (
          <Link key={lesson.id} href={`/learn/${lesson.id}`}>
            <Card className="group border-2 shadow-sm hover:shadow-md hover:border-primary transition-all cursor-pointer h-full overflow-hidden flex flex-col" style={{ animationDelay: `${idx * 50}ms` }}>
              <div className="flex flex-row h-full">
                <div className={`w-24 shrink-0 flex items-center justify-center border-r-2 transition-colors ${getColorsForVector(lesson.vector)} group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary`}>
                  {getIconForVector(lesson.vector)}
                </div>
                <div className="flex-1 p-5">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h3 className="font-bold text-lg group-hover:text-primary transition-colors leading-tight">
                      {lesson.title}
                    </h3>
                    <Badge variant="outline" className="capitalize text-xs font-bold shrink-0 shadow-none border-muted-foreground/30 text-muted-foreground">
                      {lesson.vector}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm font-medium line-clamp-2">
                    {lesson.summary}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}