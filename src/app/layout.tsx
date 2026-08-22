import type { Metadata, Viewport } from "next";
import {
	Atkinson_Hyperlegible,
	JetBrains_Mono,
	Plus_Jakarta_Sans,
} from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

/*
 * Fonts are self-hosted by next/font rather than pulled from an @import at the
 * top of globals.css. The @import was render-blocking, round-tripped to two
 * extra origins, and flashed unstyled text on every cold load. Inter used to be
 * loaded here too purely as a fallback behind Plus Jakarta Sans -- it never
 * actually rendered, so it's gone.
 *
 * Only the body face is preloaded. The mono face is for code/ID snippets on
 * admin screens and Atkinson only renders when the dyslexia-friendly setting is
 * on, so both are declared but left for the browser to fetch on demand.
 */
const jakarta = Plus_Jakarta_Sans({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-jakarta",
});

const jetbrainsMono = JetBrains_Mono({
	subsets: ["latin"],
	display: "swap",
	variable: "--font-jetbrains-mono",
	preload: false,
});

const atkinson = Atkinson_Hyperlegible({
	subsets: ["latin"],
	weight: ["400", "700"],
	display: "swap",
	variable: "--font-atkinson",
	preload: false,
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title: {
		default: "PhishAware",
		template: "%s · PhishAware",
	},
	description:
		"PhishAware: train yourself to spot phishing through a gamified, simulated inbox. Practice against realistic scams across email, SMS, voice, QR, social, and websites. No real emails, links, or credentials involved.",
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
		title: "PhishAware: train yourself to spot phishing",
		description:
			"Learn to spot phishing through a gamified, simulated inbox. No real emails, links, or credentials involved.",
		url: siteUrl,
	},
	twitter: {
		card: "summary_large_image",
		title: "PhishAware: train yourself to spot phishing",
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
	// viewport-fit=cover is what makes env(safe-area-inset-*) resolve to real
	// values on notched phones; the mobile bottom nav pads itself with the
	// bottom inset so it clears the iPhone home indicator.
	viewportFit: "cover",
	// These must track --background in globals.css, or mobile browser chrome
	// shows a seam against the top of the page.
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#f9fafb" }, // hsl(210 20% 98%)
		{ media: "(prefers-color-scheme: dark)", color: "#0f121a" }, // hsl(222 28% 8%)
	],
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={`${jakarta.variable} ${jetbrainsMono.variable} ${atkinson.variable}`}
		>
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
