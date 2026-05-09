import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone 출력 — Railway/Docker 배포 시 .next/standalone에 최소
  // 의존성만 묶인 self-contained 번들 생성. 컨테이너 이미지 크기 ~70%
  // 감소(node_modules 전체가 아닌 실제 import된 파일만 복사).
  output: "standalone",

  // 시연 환경(다른 IP·tailscale·SSH 포워딩 등)에서 dev 서버 접근 허용.
  // 운영 빌드(`npm run build && npm start`)에선 무시됨.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "100.120.53.20",
    "192.168.1.105",
  ],
};

export default nextConfig;
