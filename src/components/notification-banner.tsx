"use client";
import { Bell, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListMyNotifications,
  useMarkNotificationsRead,
  getListMyNotificationsQueryKey,
} from "@/api-client";

/**
 * Unread notifications, where somebody will actually see them.
 *
 * Assignments used to lapse in silence: a campaign appeared on the dashboard and
 * nowhere else, which only helps somebody who was already looking. This is the
 * telling part.
 *
 * Deliberately shows only unread and hides itself when there is nothing -- a
 * permanent empty panel trains people to ignore the space it occupies.
 */
export function NotificationBanner() {
  const queryClient = useQueryClient();
  const { data: notifications = [] } = useListMyNotifications();
  const markRead = useMarkNotificationsRead();

  const unread = notifications.filter((n) => !n.read);
  if (unread.length === 0) {
    return null;
  }

  const dismiss = (ids?: string[]) =>
    markRead.mutate(
      { data: ids ? { ids } : {} },
      {
        onSuccess: () =>
          queryClient.invalidateQueries({ queryKey: getListMyNotificationsQueryKey() }),
      },
    );

  return (
    <Card className="border shadow-sm">
      <CardHeader variant="band">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          {unread.length === 1 ? "1 update" : `${unread.length} updates`}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 px-2 text-xs font-semibold"
            onClick={() => dismiss()}
            disabled={markRead.isPending}
          >
            Mark all read
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-2">
        {unread.map((n) => (
          <div
            key={n.id}
            className="flex items-start gap-3 rounded-lg border px-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="pa-measure text-xs text-muted-foreground">{n.body}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={`Dismiss: ${n.title}`}
              onClick={() => dismiss([n.id])}
            >
              <Check className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
