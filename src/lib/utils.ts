import { twMerge } from 'tailwind-merge';

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** First + last initials from a name, e.g. "Jack Greenwald" -> "JG", "Guest" -> "G". */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function titleCase(string: string) {
  const stringList = string.split(" ");
  let finalString = "";
  
  for(const sub of stringList) {
    const newWord = sub.substring(0, 1).toLocaleUpperCase() + sub.substring(1).toLocaleLowerCase() + " "
    finalString += newWord;
  }

  return finalString;
}