"use client";
import { ScrollText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useListOrgAuditLog } from "@/api-client";

/**
 * Who did what inside this organization.
 *
 * The collection was provisioned from the start and never written to, so nobody
 * could answer who changed a role, moved somebody between departments, removed a
 * member, or issued a password reset code -- which hands over the ability to sign
 * in as somebody else. For a product about accountability that was a hard gap to
 * defend.
 */
const LABELS: Record<string, string> = {
  "member.invited": "invited a member",
  "member.role_changed": "changed a member's role",
  "member.department_changed": "moved a member between departments",
  "member.removed": "removed a member",
  "member.reset_code_issued": "issued a password reset code",
  "department.created": "created a department",
  "department.renamed": "renamed a department",
  "department.deleted": "deleted a department",
  "training.created": "assigned training",
  "training.deleted": "removed a training campaign",
  "org.settings_updated": "updated organization settings",
  "org.sso_updated": "updated single sign-on",
};

/** The bits of metadata worth showing inline, in the order they read best. */
function detail(metadata: Record<string, unknown>): string {
  const parts: string[] = [];
  const named = (key: string) => {
    const value = metadata[key];
    if (typeof value === "string" && value) parts.push(value);
  };
  named("name");
  named("title");
  named("department");
  named("role");
  if (typeof metadata.from === "string" && typeof metadata.to === "string") {
    parts.push(`${metadata.from} → ${metadata.to}`);
  }
  if (Array.isArray(metadata.fields) && metadata.fields.length > 0) {
    parts.push(metadata.fields.join(", "));
  }
  return parts.join(" · ");
}

export function AuditCard() {
  const { data: entries = [] } = useListOrgAuditLog({ limit: 25 });

  return (
    <Card className="border shadow-sm">
      <CardHeader variant="band">
        <CardTitle className="text-lg flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-primary" />
          Activity log
        </CardTitle>
        <CardDescription>
          Privileged actions taken in this organization. A reset code shows as
          issued; the code itself is never recorded.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Role changes, department moves, removals, issued reset
            codes and campaigns all appear here.
          </p>
        ) : (
          <ol className="divide-y rounded-lg border">
            {entries.map((entry) => {
              const extra = detail(entry.metadata ?? {});
              return (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-2 px-4 py-2.5 text-sm">
                  <span className="font-semibold">{entry.actor}</span>
                  <span className="text-muted-foreground">
                    {LABELS[entry.action] ?? entry.action}
                  </span>
                  {extra && <span className="text-muted-foreground">· {extra}</span>}
                  <time
                    dateTime={entry.at}
                    className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums"
                  >
                    {new Date(entry.at).toLocaleString()}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
