import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { headers } from "next/headers";
import { auth } from "../lib/auth";
import { isStaleAnonymous } from "../lib/session";
import { themeInitScript } from "../lib/theme";
import EndStaleAnonymousSession from "./components/EndStaleAnonymousSession";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Wikipedia AI",
  description: "AI-powered Wikipedia-style article generator. Get structured explanations instantly.",
};

export default async function RootLayout({ children }) {
  // Raw session (not getSessionUser, which hides stale anonymous sessions)
  const session = await auth.api.getSession({ headers: await headers() });
  const staleAnonymous = await isStaleAnonymous(session?.user);

  return (
    <html
      lang="en"
      // data-theme is set by themeInitScript before React hydrates
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Excerpts attached to the chat (set via CSS.highlights in ArticleView) —
            inline because Next's CSS parser rejects ::highlight(). */}
        <style dangerouslySetInnerHTML={{ __html: "::highlight(ask-context){background-color:var(--ask-mark)}" }} />
      </head>
      <body className="min-h-full flex flex-col">
        {staleAnonymous ? <EndStaleAnonymousSession /> : children}
      </body>
    </html>
  );
}
