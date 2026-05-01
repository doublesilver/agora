/* SDK/CLI raw 에러 메시지 → 친근한 한국어 분류 + 힌트.
 * 채점자·시연자에게 의미 있는 안내를 주기 위한 분류기. */

export interface FriendlyError {
  title: string;
  hint?: string;
  raw: string;
}

const PATTERNS: { match: RegExp; title: string; hint?: string }[] = [
  {
    match: /credit balance|insufficient[_ -]?credit|billing|payment.required/i,
    title: "결제·잔액 관련 가능성",
    hint: "콘솔(Anthropic / OpenAI Billing 등)에서 잔액·결제 수단·플랜을 먼저 확인하세요. 모델 권한·조직 설정도 같은 메시지를 낼 수 있어 원본 메시지(아래)를 같이 보세요.",
  },
  {
    match: /401|unauthorized|invalid[_ -]?api[_ -]?key|authentication/i,
    title: "API 키 인증 실패",
    hint: "좌측 패널에서 키 값을 다시 확인하거나 새로 발급받으세요.",
  },
  {
    match: /invalid[_ -]?request[_ -]?error|bad request/i,
    title: "요청 형식 오류",
    hint: "모델 ID, 토큰 한도, 메시지 구조 중 하나가 공급자가 받아주지 않는 형태입니다.",
  },
  {
    match: /403|forbidden|permission/i,
    title: "권한 없음",
    hint: "키의 모델 접근 권한 또는 organization 설정을 확인하세요.",
  },
  {
    match: /429|rate[_ -]?limit|too many requests|quota/i,
    title: "요청 한도 초과",
    hint: "잠시 후 다시 시도하거나 구독 등급/한도를 확인하세요.",
  },
  {
    match: /context[_ -]?length|max[_ -]?tokens|too many tokens/i,
    title: "컨텍스트 한도 초과",
    hint: "토론이 길어졌을 수 있어요. 새 세션을 시작해보세요.",
  },
  {
    match:
      /model[_ -]?not[_ -]?found|model[_ -]?does[_ -]?not[_ -]?exist|invalid[_ -]?model|unknown model/i,
    title: "모델 ID 오류",
    hint: "지정한 모델 ID가 더 이상 사용 불가능할 수 있어요.",
  },
  {
    match: /ENOENT|command not found|no such file|spawn .* not found/i,
    title: "CLI 미설치 또는 PATH 누락",
    hint: "해당 CLI가 설치되어 있는지 `which <command>`로 확인하세요.",
  },
  {
    match: /usage[_ -]?limit|over the limit|usage exceeded|quota exceeded/i,
    title: "사용량 한도 도달",
    hint: "구독 티어 또는 청구 상태를 확인하세요.",
  },
  {
    match: /aborted|sigterm|killed/i,
    title: "프로세스 중단됨",
    hint: "사용자 STOP/끼어들기로 정상 중단된 경우 무시해도 됩니다.",
  },
  {
    match: /timeout/i,
    title: "응답 시간 초과",
    hint: "네트워크/모델 부팅 지연. 다음 라운드에서 자동 재시도됩니다.",
  },
  {
    match: /network|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i,
    title: "네트워크 오류",
    hint: "인터넷 연결 또는 방화벽 설정을 확인하세요.",
  },
  {
    match: /JSON|parse/i,
    title: "응답 파싱 실패",
    hint: "공급자가 예상치 못한 형식의 응답을 보냈습니다.",
  },
];

export function friendlyError(message: string): FriendlyError {
  const safe = message ?? "";
  for (const p of PATTERNS) {
    if (p.match.test(safe)) {
      return { title: p.title, hint: p.hint, raw: safe };
    }
  }
  return {
    title: "알 수 없는 오류",
    hint: "원본 메시지를 펼쳐 확인하세요.",
    raw: safe,
  };
}
