import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agora — 사용자가 끼어들 수 있는 멀티 AI 토론",
  description:
    "여러 AI 에이전트(Claude·GPT·Gemini)가 직렬 라운드로 자유 메시지를 주고받으며 사용자의 프롬프트를 협업 처리한다. 사용자는 토론에 즉시 끼어들거나 다음 라운드에 보태거나 일시정지·재개·종료할 수 있고, 전체 transcript를 실시간으로 관찰한다.",
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
