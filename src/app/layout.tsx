import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://agora-production-17a6.up.railway.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Agora — Multi-AI Debate with Human-in-the-Loop",
    template: "%s · Agora",
  },
  description:
    "Multiple AI agents (Claude · GPT · Gemini) take turns in a serial round to discuss a topic. Users can interrupt, queue, pause, resume, or stop the debate at any time. Domain-agnostic — define your own domain via system prompts.",
  applicationName: "Agora",
  authors: [{ name: "Eunseok Lee", url: "https://github.com/doublesilver" }],
  keywords: [
    "multi-agent",
    "llm",
    "claude",
    "openai",
    "gemini",
    "ai-debate",
    "nextjs",
    "typescript",
    "sse",
    "orchestration",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Agora",
    title: "Agora — Multi-AI Debate with Human-in-the-Loop",
    description:
      "Claude · GPT · Gemini take turns in serial rounds; you can interrupt mid-debate. Domain-agnostic. Next.js 16 + TypeScript strict + SSE + JSONL.",
    locale: "en_US",
    alternateLocale: ["ko_KR"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Agora — Multi-AI Debate with Human-in-the-Loop",
    description:
      "Claude · GPT · Gemini take turns in serial rounds; you can interrupt mid-debate. Live demo + open source.",
    creator: "@doublesilver",
  },
  robots: {
    index: true,
    follow: true,
  },
  category: "developer-tools",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap"
        />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
