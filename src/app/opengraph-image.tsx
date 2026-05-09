/* 동적 OG 이미지 — 라이브 URL 공유 시 트위터·LinkedIn·카카오톡 미리보기 카드.
 * Next.js의 ImageResponse가 JSX를 1200x630 PNG로 자동 변환. 정적 파일 관리
 * 부담 없이 코드로 카드 디자인. */
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Agora — Multi-AI Debate with Human-in-the-Loop";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0d0d0d",
          color: "#f5f5f5",
          padding: "80px",
          fontFamily: "monospace",
          position: "relative",
        }}
      >
        {/* 좌상단 라벨 */}
        <div
          style={{
            display: "flex",
            fontSize: 18,
            letterSpacing: 6,
            color: "#FF6F61",
            textTransform: "uppercase",
            marginBottom: 32,
          }}
        >
          // multi-ai · human-in-the-loop · open source
        </div>

        {/* 메인 타이틀 */}
        <div
          style={{
            display: "flex",
            fontSize: 140,
            fontWeight: 700,
            letterSpacing: -4,
            lineHeight: 1,
            marginBottom: 24,
          }}
        >
          Agora
        </div>

        {/* 서브 타이틀 */}
        <div
          style={{
            display: "flex",
            fontSize: 36,
            color: "#a0a0a0",
            lineHeight: 1.3,
            marginBottom: 60,
            maxWidth: "90%",
          }}
        >
          Claude · GPT · Gemini take turns in serial rounds.
          <br />
          You interrupt mid-debate.
        </div>

        {/* 하단 메타 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginTop: "auto",
            width: "100%",
            fontSize: 22,
            color: "#666",
          }}
        >
          <div style={{ display: "flex", gap: 32 }}>
            <span>Next.js 16</span>
            <span>·</span>
            <span>TypeScript strict</span>
            <span>·</span>
            <span>SSE · JSONL</span>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 20,
              color: "#FF6F61",
              fontWeight: 600,
            }}
          >
            agora-production-17a6.up.railway.app
          </div>
        </div>

        {/* 우상단 점·코너 장식 (Brutalist Forum 톤) */}
        <div
          style={{
            position: "absolute",
            top: 60,
            right: 60,
            width: 16,
            height: 16,
            background: "#FF6F61",
            borderRadius: 0,
            display: "flex",
          }}
        />
      </div>
    ),
    {
      ...size,
    },
  );
}
