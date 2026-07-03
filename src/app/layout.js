import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Google Font imports for sans and monospace typography
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Global metadata for the application
export const metadata = {
  title: "Wikipedia AI",
  description: "AI-powered Wikipedia-style article generator. Get structured explanations instantly.",
};

/**
 * Root layout component that wraps all pages in the application.
 * Sets up global fonts, typography, and basic HTML structure.
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Page content to be rendered
 * @returns {React.ReactElement} HTML document structure
 */
export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
