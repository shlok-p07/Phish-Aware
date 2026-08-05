"use client";
import { TrendingUp, Users, ShieldAlert, CheckCircle2 } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetOrgAnalytics } from "@/api-client";

const riskColor: Record<string, string> = {
  low: "hsl(var(--success))",
  medium: "hsl(var(--warning))",
  high: "hsl(var(--destructive))",
};

export default function AdminAnalyticsPage() {
  const { data: a } = useGetOrgAnalytics();

  const kpis = [
    { label: "Average accuracy", value: `${a?.avgAccuracy ?? 0}%`, icon: TrendingUp, tint: "text-primary" },
    { label: "Active members", value: a?.activeCount ?? 0, icon: Users, tint: "text-primary" },
    { label: "Participation rate", value: `${a?.participationRate ?? 0}%`, icon: CheckCircle2, tint: "text-success" },
    { label: "At-risk members", value: a?.atRisk ?? 0, icon: ShieldAlert, tint: "text-destructive" },
  ];

  const perMember = (a?.perMember ?? []).map((m) => ({
    name: m.name.split(" ")[0],
    accuracy: m.accuracy,
    risk: m.risk,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="border shadow-sm">
            <CardContent className="pt-6">
              <k.icon className={`w-6 h-6 mb-2 ${k.tint}`} />
              <p className="text-2xl font-bold tabular-nums">{k.value}</p>
              <p className="text-sm text-muted-foreground font-medium">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border shadow-sm">
        <CardHeader variant="band">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Accuracy by member
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="h-72 w-full">
            {perMember.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perMember} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} dy={8} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                    contentStyle={{
                      borderRadius: "10px",
                      border: "1px solid hsl(var(--border))",
                      boxShadow: "var(--shadow-md)",
                      background: "hsl(var(--popover))",
                      color: "hsl(var(--popover-foreground))",
                    }}
                    itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                    formatter={(value: number) => [`${value}%`, "Accuracy"]}
                  />
                  <Bar dataKey="accuracy" radius={[6, 6, 0, 0]} maxBarSize={48}>
                    {perMember.map((m, i) => (
                      <Cell key={i} fill={riskColor[m.risk]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground font-medium">
                No active members yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader variant="band">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" />
            Risk distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {(["low", "medium", "high"] as const).map((band) => {
            const count = a?.riskBands[band] ?? 0;
            const pct = a?.activeCount ? Math.round((count / a.activeCount) * 100) : 0;
            return (
              <div key={band} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold capitalize">{band} risk</span>
                  <span className="text-muted-foreground font-medium">{count} · {pct}%</span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: riskColor[band] }} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
