"use client";

// Thin wouter-compatible shim backed by the Next.js App Router, so the ported
// pages can keep using `Link`, `useLocation`, and `useParams` unchanged.
import * as React from "react";
import NextLink from "next/link";
import { usePathname, useRouter, useParams as useNextParams } from "next/navigation";

/** wouter's useLocation(): returns [pathname, navigate]. */
export function useLocation(): [string, (to: string) => void] {
  const pathname = usePathname();
  const router = useRouter();
  const navigate = React.useCallback((to: string) => router.push(to), [router]);
  return [pathname ?? "/", navigate];
}

/** wouter's useParams(): route params as a plain object of strings. */
export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useNextParams() as T;
}

type LinkProps = Omit<React.ComponentProps<typeof NextLink>, "href"> & {
  href: string;
  children: React.ReactNode;
};

/** wouter's <Link href="...">; maps directly onto next/link. */
export function Link({ href, children, ...rest }: LinkProps) {
  return (
    <NextLink href={href} {...rest}>
      {children}
    </NextLink>
  );
}
