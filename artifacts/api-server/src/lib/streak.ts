export function computeStreak(lastActiveDate: string | null, todayIso: string, currentStreak: number): number {
  if (lastActiveDate === todayIso) {
    return currentStreak || 1;
  }
  const yesterday = new Date(todayIso);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayIso = yesterday.toISOString().slice(0, 10);
  if (lastActiveDate === yesterdayIso) {
    return currentStreak + 1;
  }
  return 1;
}
