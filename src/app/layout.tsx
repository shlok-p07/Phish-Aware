import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title: {
		default: "PhishAware",
		template: "%s · PhishAware",
	},
	description:
		"PhishAware — train yourself to spot phishing through a gamified, simulated inbox. Practice against realistic scams across email, SMS, voice, QR, social, and websites. No real emails, links, or credentials involved.",
	applicationName: "PhishAware",
	keywords: [
		"phishing",
		"phishing awareness",
		"security training",
		"cybersecurity",
		"phishing simulation",
		"smishing",
		"vishing",
		"security awareness training",
	],
	authors: [{ name: "PhishAware" }],
	category: "education",
	alternates: { canonical: "/" },
	openGraph: {
		type: "website",
		siteName: "PhishAware",
		title: "PhishAware — Train yourself to spot phishing",
		description:
			"Learn to spot phishing through a gamified, simulated inbox. No real emails, links, or credentials involved.",
		url: siteUrl,
	},
	twitter: {
		card: "summary_large_image",
		title: "PhishAware — Train yourself to spot phishing",
		description:
			"Learn to spot phishing through a gamified, simulated inbox. No real emails, links, or credentials involved.",
	},
	robots: {
		index: true,
		follow: true,
		googleBot: { index: true, follow: true },
	},
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#ffffff" },
		{ media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
	],
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
