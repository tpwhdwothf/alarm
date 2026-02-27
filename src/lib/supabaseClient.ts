import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "SUPABASE_URL 또는 SUPABASE_ANON_KEY 가 설정되지 않았습니다. Supabase 관련 기능은 동작하지 않습니다."
  );
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않아 관리자용 Supabase 클라이언트를 생성하지 않습니다. (/목록 등 일부 기능이 제한될 수 있습니다.)"
  );
}

export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// RLS 를 우회하고 테이블 전체를 조회해야 하는 서버 전용 작업용 클라이언트
// (절대 클라이언트/브라우저에 노출되면 안 되는 키이므로, 봇/워커 코드에서만 사용)
export const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

