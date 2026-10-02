# 좆좆소 (JJOKJJOKSO)

증거 기반 기업·매장 제보·공유 사이트. **Cloudflare Pages(무료, 도메인 미구매)** + **Supabase(무료 티어)** 로만 운영됩니다.

- 제보 접수 시 **증거 1건 이상 필수**, 검증 전까지 비공개
- 상태 배지: 접수 대기 → 검증 진행중 → 검증 완료 / 부분 검증 / 반려
- **반론권**: 대상(기업·매장)이 공식 반론 등록 → 관리자 승인 시 `반론 등록` 상태로 공개
- 접수 후 받는 **접수번호 링크**로 진행 상황 추적 (이 링크를 보관해야 대기중 제보를 볼 수 있음)
- 관리자 대시보드: 상태 판정, 메모(공개 이력), 반론 승인/반려, 댓글 삭제

```
consumer-record/
├── index.html            # 메인 (통계 + 제보 목록/검색/필터)
├── report.html           # 3단계 제보 작성 (증거 업로드)
├── subjects.html         # 제보 대상 등록 · 검색
├── post.html             # 제보 상세 (증거 갤러리, 검증 타임라인, 반론, 댓글)
├── rules.html            # 검증 기준 / 증거 기준 / 반론권 / 면책
├── admin.html            # 관리자 로그인 + 검증 대시보드
├── _headers              # 보안 헤더 (CSP 등)
├── assets/
│   ├── css/style.css     # 디자인 시스템
│   └── js/
│       ├── config.js     # ★ Supabase URL / anon 키 (본인 값으로 수정)
│       ├── db.js         # Supabase 클라이언트
│       ├── app.js        # 공통 유틸 · 목록 조회
│       └── ...           # 페이지별 스크립트
└── supabase/schema.sql   # 테이블 · RLS · 스토리지 · 함수
```

---

## 1. Supabase 설정

> **진행 상태**: `assets/js/config.js` 는 새 프로젝트 `nfvdhqcscfvovcjgmaba` 에 연결됨.
> `supabase/schema.sql`(테이블·함수) · `supabase/storage.sql`(증거 버킷) 실행 완료.
> 남은 SQL: **`supabase/subjects.sql` 1회 실행** (제보 대상 등록 테이블).


1. [supabase.com](https://supabase.com) 에서 **New project** 생성 (Free tier).
2. 좌측 **SQL Editor** → `supabase/schema.sql` **전체를 붙여넣고 Run**.
   - 테이블, RLS 정책, 상태 이력 트리거, 증거 스토리지(`evidence` bucket)가 자동 생성됩니다.
   - 이어서 `supabase/storage.sql`, `supabase/subjects.sql` 도 각각 Run 합니다.
3. **Authentication → Users → Add user** 로 관리자 계정(이메일/비밀번호)을 만듭니다.
4. SQL Editor로 관리자 등록 (3에서 만든 user_id 사용):

   ```sql
   insert into public.admins (user_id) values ('여기에_유저_UUID');
   ```

   ※ user_id 는 Users 화면에서 복사하거나 아래로 확인:

   ```sql
   select id, email from auth.users;
   ```

5. **Settings → API** 에서 다음 두 값을 복사합니다.
   - `Project URL`
   - `anon public` 키
6. `assets/js/config.js` 의 값을 바꿉니다.

   ```js
   export const SUPABASE_URL = "https://xxxx.supabase.co";
   export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
   ```

7. (선택) 화면 확인용 샘플 제보 3건 삽입: `supabase/seed.sql` 실행.
   - 실제 운영 시작 전 `delete from public.posts where id like 'a1000000-%';` 로 삭제하세요.

> anon 키는 클라이언트에 공개되는 키이며, **RLS 정책이 모든 것을 방어**합니다.
> 공개 쓰기는 제보/증거/댓글/반론 "등록"과 증거 파일 업로드(10MB 제한)만 허용됩니다.

## 2. Cloudflare Pages 배포 (도메인 없음)

### 방법 A — 대시보드 (가장 간단)

1. [Cloudflare 대시보드](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
2. 프로젝트명 입력 (예: `consumer-record`) → **생성**.
3. `consumer-record/` **폴더 전체**를 드래그해서 업로드 → Deploy.
4. `https://consumer-record.pages.dev` 로 접근 완료.

### 방법 B — Wrangler CLI

```powershell
npm install -g wrangler
wrangler login
wrangler pages project create consumer-record --production-branch=main
wrangler pages deploy . --project-name consumer-record
```

(위 명령은 `consumer-record/` 폴더 안에서 실행)

이후 변경 시 폴더 안에서 `wrangler pages deploy . --project-name consumer-record` 만 다시 실행하면 됩니다.

## 3. 검색엔진 등록 (Google Search Console · 네이버 서치어드바이저)

배포 전이라 URL 자리표시자가 `https://YOUR-SITE.pages.dev` 로 들어가 있습니다.
**배포 후 아래 파일의 `YOUR-SITE` 를 실제 주소로 전부 교체**하고 다시 배포하세요.

```powershell
# consumer-record 폴더에서 실행
Get-ChildItem -Recurse -Include *.html,robots.txt,sitemap.xml |
  ForEach-Object {
    $c = Get-Content -Raw -Encoding UTF8 $_.FullName
    Set-Content $_.FullName ($c -replace 'https://YOUR-SITE\.pages\.dev', 'https://실제주소.pages.dev') -Encoding UTF8 -NoNewline
  }
```

### 이전 등록 정보 재사용 (BLACKCONSUMER 에서 찾아 적용함)

| 항목 | 값 | 출처 |
| --- | --- | --- |
| 이전 사이트 URL | `https://blackconsumer.vercel.app` (운영 중) | `BLACKCONSUMER/src/lib/site.ts` |
| Google 인증 토큰 | `5m9WrjHo6HZ1aRzDjKvDEtLsv1Egv2K2yi-clQ1WHfk` | `layout.tsx` / `sise-fix` |
| Naver 인증 토큰 | `985014f4ac67680cdea4dbd3395ad557fc22dca1` | `layout.tsx` |

- 위 두 토큰은 **이미 모든 페이지에 적용해 두었습니다.**
- 구글은 같은 계정의 속성이면 대부분 재사용 통과. **네이버는 사이트별 발급**이므로
  최종 URL로 소유 확인이 실패하면 → 서치어드바이저에서 **신규 사이트 등록 → 발급된 값으로 교체**(1분).
- 최종 URL이 `blackconsumer.vercel.app` 이 아니라면(예: `*.pages.dev`) 위 사실을 감안해 재확인하세요.

### 준비된 SEO 파일

| 파일/태그 | 역할 |
| --- | --- |
| `robots.txt` | 크롤러 허용, `/admin.html` 차단, sitemap 위치 |
| `sitemap.xml` | 메인 · 제보 작성 · 검증 기준 3개 URL |
| `<meta name="google-site-verification">` | 구글 소유 인증 (전 페이지 `<head>`) |
| `<meta name="naver-site-verification">` | 네이버 소유 인증 (전 페이지 `<head>`) |
| `canonical` / `og:*` / `twitter:*` | 중복 방지, 공유 미리보기 카드 |
| JSON-LD (`WebSite`) | 사이트 구조화 데이터 |
| `assets/favicon.svg` | 파비콘 (ㅈㅈ 마크) |

### 1) Google Search Console 등록

1. <https://search.google.com/search-console> → **속성 추가** → **URL 기준** → 사이트 URL 입력
2. **소유권 확인** → **HTML 태그** 방식 → `content="..."` 안의 값을 복사
3. 모든 `.html` 파일의 `GOOGLE_SEARCH_CONSOLE_TOKEN` 을 그 값으로 교체 → 재배포
4. 검증 완료 → 좌측 **사이트맵** → `sitemap.xml` 제출
5. **URL 검사** → 메인 페이지에 대해 **색인 요청**

### 2) 네이버 서치어드바이저 등록

1. <https://searchadvisor.naver.com> → **사이트 등록**
2. 사이트 URL 입력 → 확인 방법 **메타태그** 선택 → content 값 복사
3. 모든 `.html` 파일의 `NAVER_SEARCH_ADVISOR_TOKEN` 교체 → 재배포
4. **소유 확인** 클릭 → 통과
5. **사이트맵** 메뉴에서 `sitemap.xml` 제출 (즉시 반영되지 않을 수 있어 1~2일 재시도)

### 3) 등록 후 참고

- `*.pages.dev` 도메인은 네이버 색인이 느리거나 제한될 수 있습니다. 안정적인 색인이 필요하면 커스텀 도메인 연결을 권장합니다.
- `post.html?id=...` 상세 페이지는 구조가 동적이라 sitemap 대상이 아닙니다. 유입은 목록·검색·공유 링크 기준입니다.
- 소유 인증은 **반드시 배포된 URL 기준**으로 진행해야 합니다. 배포 전 검증은 통과하지 못합니다.

## 4. 운영 체크리스트

| 항목 | 위치 |
| --- | --- |
| Supabase 연결 | `assets/js/config.js` |
| 관리자 등록 | SQL: `insert into public.admins ...` |
| 스토리지 확인 | Storage → `evidence` bucket (public, 10MB) |
| 보안 헤더 | `_headers` (CSP가 jsdelivr/Supabase만 허용) |
| 반론/댓글 검토 | `admin.html` |
| 검증 토큰 | `GOOGLE_SEARCH_CONSOLE_TOKEN` / `NAVER_SEARCH_ADVISOR_TOKEN` (전 페이지) |
| SEO 파일 | `robots.txt`, `sitemap.xml`, `assets/favicon.svg` |

## 5. 신뢰성 설계 요약

- **공개 범위**: 목록에는 `검증 진행중/완료/부분/반론 등록`만 노출. `접수 대기`는 접수번호 링크로만, `반려`는 공개 안 함.
- **상태 이력**: 상태 변경 시 `status_events` 자동 기록 → 상세 페이지 타임라인으로 공개 (내부 메모는 `internal=true` 처리).
- **증거 일관성**: 파일 업로드 + 출처 링크 + 캡션/시점 기록, 클라이언트·DB 양쪽에서 필수 개수/길이 검증.
- **반론 균형**: 반론 승인 시 제보 상태가 `반론 등록`으로 전환되어 목록에서 바로 식별 가능.
- **악용 방어**: 공감은 브라우저별 키 1회, 상태 판정은 RLS로 관리자 전용, 내부 메모 비공개.

## 6. 운영 시 반드시 추가할 것 (권장)

이 저장소는 **구조와 UI 데모**를 우선으로 했으며, 실서비스 전에 다음을 고려하세요.

1. **제보 추적 토큰 고정화**: 현재 `post.html?id=..&t=..` 링크 분실 시 대기중 제보를 볼 수 없음 → 발송/저장 기능 추가.
2. **Spam/Rate limit**: Supabase Auth(로그인 후 제보) 또는 Cloudflare WAF 규칙, Turnstile 적용.
3. **증거 원본 보관**: public bucket 대신 사설 bucket + 서명 URL(403 방지), 만료 정책.
4. **법적 리스크 관리**: 실제 운영 시 명예훼손 대응 절차, 정정·삭제 요청 채널, 운영자 연락처 표기.
5. **개인정보**: 업로드 전 클라이언트 EXIF/이미지 마스킹 가이드 강화.

## 7. 로컬 확인

```powershell
python -m http.server 8080
# http://localhost:8080
```

※ ES 모듈 사용으로 `file://` 직접 열기는 동작하지 않습니다. 로컬 서버 또는 배포 환경에서 실행하세요.
