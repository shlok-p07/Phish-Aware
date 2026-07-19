import { twMerge } from 'tailwind-merge';

import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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