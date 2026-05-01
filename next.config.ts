import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 시연 환경(다른 IP·tailscale·SSH 포워딩 등)에서 dev 서버 접근 허용.
  // 채점자 접근은 localhost만 → 운영 빌드(`npm run build && npm start`)에선 무시됨.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "100.120.53.20",
    "192.168.1.105",
  ],
};

export default nextConfig;
