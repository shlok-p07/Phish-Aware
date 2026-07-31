"use client";
import { use } from "react";
import { InviteContent } from "./invite-content";

/**
 * Thin shell: unwrap the params promise and hand the token down.
 *
 * Next 15 delivers route params to client components as a promise, and
 * React 19's use() suspends on it. Keeping that in its own component means
 * InviteContent takes a plain string and can be rendered directly in tests
 * without a Suspense boundary.
 */
export default function InvitePage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = use(params);
	return <InviteContent token={token} />;
}
