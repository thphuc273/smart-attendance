# PROMPT_LOG — Smart Attendance

> Nhật ký làm việc với AI IDE (Claude Code). Ghi lại **prompt → hành động → kết quả → quyết định** để team review và làm evidence cho tiêu chí đánh giá "AI IDE workflow & Prompt Log" (15%).

---

## Session #001 — Khởi tạo tài liệu nền (trước log này)

Đã có sẵn khi bắt đầu session: `docs/ASSIGNMENT.md`, `docs/spec.md` v0.1, `docs/erd.md` v0.1, `docs/api-spec.md` v0.1, `docs/CLAUDE.md`. Chưa có source code.

---

## Session #002 — 2026-04-16 — Zero-tap check-in + chuyển stack mobile

### Prompt gốc (rút gọn)

> "Ghi lại quá trình làm việc với AI, nghiên cứu chi tiết lại hệ thống và cập nhật các file md nếu cần thiết, bổ sung thêm tính năng **zero-tap check-in** — Nhân viên không cần mở app, không cần chạm. Khi điện thoại kết nối WiFi công ty (hoặc vào vùng geofence), hệ thống tự động check-in trong nền với đầy đủ validation chống gian lận."
>
> Follow-up: "cập nhật lại phần mobile, dùng expo và react native"

### 1. Research (AI làm trước khi sửa)

Đã đọc hết:
- `docs/ASSIGNMENT.md` — đề bài, tiêu chí đánh giá, quy mô 100 chi nhánh × 5.000 nhân viên
- `docs/spec.md` v0.1 — 14 mục, nghiệp vụ + scale strategy + MVP scope
- `docs/erd.md` v0.1 — schema Prisma đầy đủ, 15 bảng, index strategy
- `docs/api-spec.md` v0.1 — 8 module endpoint, error catalog, rate limit
- `docs/CLAUDE.md` — context rule cho AI IDE

**Nhận định:**
- Hệ thống đã có nền tảng tốt: anti-fraud multi-layer (hard reject → risk flag → trust score), multi-branch ngay từ schema, cron daily-summary
- Tính năng "zero-tap" chưa được đề cập → đây là cơ hội differentiator cho mục **Sáng tạo (25%)**
- Mobile stack ban đầu là Ionic + Capacitor → user muốn đổi sang Expo + React Native (hiện đại hơn, background task tốt hơn qua `expo-task-manager`)

### 2. Quyết định thiết kế

| # | Câu hỏi | Lựa chọn | Lý do |
|---|---|---|---|
| 1 | Endpoint zero-tap: reuse `/check-in` hay tách? | **Tách** `/attendance/zero-tap/check-in` | Khác guard (attestation, consent, cooldown), khác rate limit, khác anti-fraud lớp 4 — trộn vào endpoint chung sẽ phức tạp và dễ leak bypass |
| 2 | Consent lưu ở đâu? | **Per-device** trên `employee_devices` (`zero_tap_enabled`, `zero_tap_consent_at`, `zero_tap_revoked_at`) | Nhân viên có thể có nhiều device (cá nhân + công ty), opt-in từng device một |
| 3 | Policy per-branch ở đâu? | Bảng riêng `branch_zero_tap_policies` (1:1 với `branches`) | Không làm phình `branches`, dễ audit thay đổi cấu hình, cho phép admin bật/tắt từng branch |
| 4 | Chống replay zero-tap? | UNIQUE `(device_id, nonce)` + `trigger_at` phải lệch ≤90s | Background request có thể bị intercept → bắt buộc nonce unique mỗi lần |
| 5 | Device attestation | Play Integrity (Android) + App Attest (iOS) | Chuẩn công nghiệp, free, chống emulator/rooted device |
| 6 | Trust score zero-tap | **Trừ 5 điểm** so với manual | Không có user interaction → thận trọng hơn, nhưng không phạt nặng nếu đã có device trusted + attestation |
| 7 | Điều kiện bật zero-tap | Phải có ≥2 manual check-in thành công + is_trusted | "Warm-up" phase tránh lạm dụng ngay ngày đầu |
| 8 | Window zero-tap | Check-in 07:00–09:30, check-out 17:00–20:00 (configurable) | Ngoài window → reject, tránh trigger giả lúc nửa đêm |
| 9 | Cooldown | 600s mặc định | Chống burst (WiFi disconnect/reconnect liên tục) |
| 10 | Mock location trong zero-tap | Auto revoke device 7 ngày | Nặng hơn manual vì zero-tap có ý đồ tấn công rõ hơn |
| 11 | Minh bạch với nhân viên | **Bắt buộc** local notification sau zero-tap success | Nhân viên phải biết hệ thống đã check-in hộ mình, tránh tranh chấp |
| 12 | Mobile stack | **Expo SDK 51 + React Native + expo-router + NativeWind** | User yêu cầu; Expo có hệ sinh thái tốt cho geofence background (expo-task-manager) |
| 13 | Web portal stack | **Next.js 15 + React 19 + Tailwind + shadcn/ui** | Dùng chung `libs/shared/*` với mobile (zod schema, API client), modern RSC |

### 3. Thay đổi tài liệu

#### `docs/spec.md` (v0.1 → v0.2)

- **§2 Tech stack:** đổi Mobile sang Expo + RN, Web sang Next.js
- **§4.3 mới — Zero-tap check-in:** điều kiện kích hoạt (5 điều kiện AND), trigger sources (3 loại), flow chi tiết mapping theo Expo packages (`expo-task-manager`, `expo-location`, `expo-notifications`), opt-out flow
- **§4.4, §4.5:** đổi số (cũ = §4.3, §4.4)
- **§5.6 mới — Zero-tap rules:** bảng 10 quy tắc (consent, device trust, window, cooldown, quota, trust score, mock location, revoke, branch override, notification)
- **§6 Lớp 4 anti-fraud mới:** 6 rủi ro riêng cho zero-tap (lending device, emulator, mock location, abuse, replay, on_leave) kèm biện pháp
- **§6 "Lưu ý thực tế":** cập nhật cho Expo (entitlement iOS, permission Android 13+, expo-location geofencing)
- **§9.4:** thêm 4 endpoint zero-tap vào module list
- **§10 ERD summary:** thêm `branch_zero_tap_policies`, cột zero-tap trên `employee_devices`, field `trigger` trên `attendance_events`
- **§11 MVP scope:** thêm zero-tap vào Bonus ngày 4–5
- **§13 Quyết định:** thêm quyết định 8, 9, 10; cập nhật quyết định 6 (thêm "Zero-tap check-in" vào sáng tạo chính)
- **§14 Changelog:** v0.2 với tóm tắt

#### `docs/erd.md` (v0.1 → v0.2)

- **§3 Enums mới:** `AttendanceTrigger` (manual, zero_tap_wifi, zero_tap_geofence, zero_tap_silent_push), `ZeroTapRevokeReason`
- **§3 `EmployeeDevice`:** thêm cột `successful_checkin_count`, `zero_tap_enabled`, `zero_tap_consent_at`, `zero_tap_revoked_at`, `zero_tap_revoke_reason`, `zero_tap_last_trigger_at`, `attestation_verified_at`, `device_lock_enabled`, `updated_at`. Thêm index `(zero_tap_enabled, is_trusted)`
- **§3 Model mới `BranchZeroTapPolicy`:** 1:1 với `Branch`, các field window/cooldown/trust deduction/require_*
- **§3 `Branch`:** thêm relation `zeroTapPolicy`
- **§3 `AttendanceEvent`:** thêm `trigger` (default `manual`), `nonce`, `trigger_at`, `attestation_ok`. Thêm UNIQUE `(device_id, nonce)` chống replay + index `(trigger, created_at)`
- **§4 Index strategy:** thêm 3 index mới
- **§7 Rule mapping:** thêm 5 rule mới liên quan zero-tap
- **§10 Changelog:** v0.2

#### `docs/api-spec.md` (v0.1 → v0.2)

- **§5B mới — Zero-tap module:** 6 endpoints:
  - `POST /attendance/zero-tap/check-in` (nonce, trigger_at, attestation header)
  - `POST /attendance/zero-tap/check-out`
  - `GET /attendance/zero-tap/settings/me`
  - `PATCH /attendance/zero-tap/settings/me`
  - `GET /branches/:id/zero-tap-policy`
  - `PUT /branches/:id/zero-tap-policy`
  - `POST /employees/:id/devices/:deviceId/revoke-zero-tap`
- **§10 Error catalog:** thêm 8 error code (`ATTESTATION_FAILED`, `ZERO_TAP_NOT_CONSENTED`, `ZERO_TAP_BRANCH_DISABLED`, `ZERO_TAP_COOLDOWN`, `ZERO_TAP_REPLAY`, `ZERO_TAP_OUTSIDE_WINDOW`, `DEVICE_NOT_TRUSTED_FOR_ZERO_TAP`, `DEVICE_LOCK_REQUIRED`)
- **§11 Rate limit:** thêm limit cho zero-tap endpoints (3 req/phút/device + cooldown server-side)
- **§13 Changelog:** v0.2

#### `docs/CLAUDE.md`

- **§2 Tech stack:** đổi Mobile → Expo + RN, Web → Next.js
- **§3 Structure:** `apps/mobile` comment Expo, `apps/portal` comment Next.js, thêm module `zero-tap/`
- **§4.5 viết lại:** Mobile Expo (expo-router, prebuild, EAS Build, Zustand, NativeWind, expo-secure-store, packages cho zero-tap)
- **§4.6 mới:** Web portal Next.js (App Router, RSC, shadcn/ui, react-hook-form + zod dùng chung)
- **§5.6 mới — Zero-tap check-in (flagship differentiator):** 7 gạch đầu dòng rule cho AI khi sinh code zero-tap
- **§5.7 → 5.8:** đổi số Performance
- **§8 Forbidden:** bỏ rule Angular, thêm 3 rule mới (class component, Expo Go với native module, AsyncStorage cho token)
- **§10 Quick reference:** thêm 2 dòng zero-tap

#### `PROMPT_LOG.md` (file này)

Mới tạo, sẽ tiếp tục log cho các session sau.

### 4. Review process đã áp dụng

- AI đọc TẤT CẢ 4 file docs trước khi sửa (không đoán)
- Mọi thay đổi schema → ghi lại trong erd.md §7 "Rule mapping" để tracing từ rule → bảng
- Mọi endpoint mới → có error code tương ứng trong §10
- Không tạo file ngoài structure đã định, không thêm dependency mà không document
- Changelog cả 3 file đều có v0.2 để dễ diff sau

### 5. Gì chưa làm (follow-up sessions)

- [ ] Sinh Prisma migration đầu tiên từ erd.md v0.2
- [ ] Sinh NestJS skeleton `libs/api/zero-tap/` với module, service, controller, DTO
- [ ] Sinh `libs/shared/utils/zero-tap-guard.ts` (pure function test trước)
- [ ] Expo app mobile: setup expo-router, expo-task-manager, geofence background task
- [ ] Next.js portal: setup App Router + shadcn/ui, trang admin quản lý branch zero-tap policy
- [ ] Seed thêm 2 device test (1 eligible zero-tap, 1 chưa trusted) vào `prisma/seed.ts`
- [ ] README root: setup guide + chiến lược scale + section riêng về zero-tap

### 6. Bài học cho lần sau

- Đọc xong docs cũ TRƯỚC khi đề xuất feature → tránh trùng hoặc phá nguyên tắc hiện có
- Khi thêm feature cross-cutting (spec + erd + api), cập nhật đồng thời 3 file + changelog sync
- Zero-tap là feature privacy-sensitive → consent, revoke, notification là **bắt buộc**, không "nice-to-have"

---

## Session #003 — 2026-04-16 — Day 1 Sprint: Foundation + Auth + Branches

### Prompt gốc

> "Hãy bắt đầu sprint 1 — cùng với đó là setup repo github."
>
> Follow-up 1: "đã cài gh CLI"
> Follow-up 2: "tạo branch theo từng feature chi tiết, không được chung chung" (sau khi AI push monolithic scaffold lên main)
> Follow-up 3: "tạo branch theo từng feature không cần ghi day1, day2"

### 1. Research (trước khi sinh code)

Đã đọc lại:
- `docs/sprint-plan.md` Day 1 (DoD, files cần tạo, endpoint list)
- `docs/spec.md §3` (RBAC 3 role), §4.1 (check-in flow), §8 (scale)
- `docs/erd.md §3` (Day 1 tables: users, roles, branches, departments, wifi, geofences, schedules, audit)
- `docs/api-spec.md §2, §3` (auth + branches endpoints)
- `docs/CLAUDE.md §4.2` (NestJS conventions), §5.3 (validation 2 layers)

### 2. Quyết định kỹ thuật (phát sinh trong session)

| # | Câu hỏi | Quyết định | Rationale |
|---|---|---|---|
| 1 | Nx vs pnpm workspaces? | **pnpm workspaces**, Nx để sau | Nx CLI init vào repo đã có files phức tạp; pnpm đủ cho 5-day MVP. Log lại để xem xét thêm Nx khi build cache cần thiết |
| 2 | Refresh token blocklist? | **Stateless MVP**, revoke list Day 4 | Giảm scope Day 1, không cần Redis session cho MVP |
| 3 | Manager → branch relation | Bảng riêng `manager_branches` (M:N) | 1 manager có thể phụ trách nhiều chi nhánh (spec §3). Lưu sẵn `managed_branch_ids` trong JWT claim để guard nhanh, không query thêm |
| 4 | Token storage mobile | `expo-secure-store` (Keychain/Keystore) | CLAUDE.md §8 cấm AsyncStorage cho token. SecureStore dùng Keychain iOS + EncryptedSharedPreferences Android |
| 5 | Password hash | **argon2**, không bcrypt | Chuẩn OWASP 2023+, default memory 19MB/iter 2 đủ an toàn |
| 6 | Commit cho scaffold | **Tách per-feature**, không 1 commit gộp | Felix push back khi AI định dùng 1 branch `feature/day1-foundation` duy nhất. Reset main + rebuild 8 feature branches + 8 PRs |
| 7 | Base commit trên main | Chỉ docs + README + .gitignore | Feature flow đúng Git Flow: main = release, feature = code |
| 8 | Branch naming | `feature/<scope>` không prefix `day1-` | Theo yêu cầu Felix — tên branch phải tự mô tả feature, không gắn ngày |
| 9 | PR merge strategy | **Squash merge** + delete branch | Develop history 1 commit/feature, sạch khi grader xem `git log` |
| 10 | AppModule evolution | Reduced → add AuthModule → add BranchesModule qua 3 PRs | Mỗi feature PR thực sự sửa AppModule, show dependency chain |
| 11 | tsconfig rootDir | `./src` (loại `prisma/seed.ts`) | Build đầu tiên `dist/src/main.js` do seed nằm ngoài src. Fix bằng rootDir + exclude prisma → `dist/main.js` |
| 12 | pnpm native builds | `pnpm.onlyBuiltDependencies` whitelist | Tránh pnpm 10 chặn build scripts mặc định; explicit trust cho prisma/argon2/nestjs |

### 3. Sai lầm và cách sửa (quan trọng nhất cho tiêu chí 15%)

**Sai lầm 1: Commit scaffold gộp lên main**
- Sau khi scaffold xong 30+ files (api, portal, mobile, docker, prisma), AI chạy `git add -A && git commit` thành 1 commit to đùng rồi push lên `main` + tạo GitHub repo. Vi phạm Git Flow rule "Mỗi feature = 1 branch + PR".
- **Fix**: Force-push main về `5ab34d3` (chỉ docs), tạo 8 feature branch riêng, 8 PRs squash merge vào develop.
- **Bài học**: Khi bắt đầu implement nhiều thứ song song, **PHẢI** pre-plan branching trước khi `git add`. Không được "commit trước, refactor history sau".

**Sai lầm 2: Đặt tên branch gắn ngày `feature/day1-*`**
- Nhân thể convention của sprint-plan.md (ngày 1–5), đặt prefix branch theo ngày. Felix reject: tên branch phải mô tả feature, không phải timeline.
- **Fix**: Rename prefix → `feature/monorepo-tooling`, `feature/auth-module`, v.v.
- **Bài học**: Branch name là contract dài hạn (người đọc code 6 tháng sau không quan tâm sprint ngày nào), còn sprint tracking thuộc về tên PR/commit message/sprint-plan.md.

**Sai lầm 3: tsconfig include `prisma/seed.ts` → dist layout lệch**
- Nest build lần đầu ra `dist/src/main.js` thay vì `dist/main.js` vì TypeScript tự set rootDir = common-ancestor của tất cả input.
- **Fix**: Explicit `rootDir: './src'` + `exclude: ['prisma']`. Seed chạy qua ts-node nên không cần compile.
- **Bài học**: Với Nest project, luôn set `rootDir` explicit nếu có file TS ngoài `src/`.

### 4. File & PR đã tạo

**Main (baseline):**
- commit `5ab34d3` — `docs: initial project baseline` (README, docs/, PROMPT_LOG, .gitignore)

**Develop (Day 1 work):**
| PR | Branch | Scope | Files chính |
|---|---|---|---|
| #1 | `feature/monorepo-tooling` | pnpm workspace + tsconfig base + prettier + commitlint | package.json, pnpm-workspace.yaml, tsconfig.base.json, .editorconfig, .prettierrc, commitlint.config.cjs, pnpm-lock.yaml, .npmrc |
| #2 | `feature/docker-env` | compose + env template | docker-compose.yml, .dockerignore, .env.example |
| #3 | `feature/prisma-schema-init` | migration #1 + admin seed | apps/api/package.json, schema.prisma, seed.ts |
| #4 | `feature/api-bootstrap` | NestJS skeleton + common + Dockerfile | apps/api/src/{main,app.module,config,common,modules/prisma}, tsconfig.json, nest-cli.json, Dockerfile |
| #5 | `feature/auth-module` | JWT login/refresh/me | apps/api/src/modules/auth + AppModule wire |
| #6 | `feature/branches-module` | Branch CRUD + wifi + geofence | apps/api/src/modules/branches + AppModule wire |
| #7 | `feature/portal-skeleton` | Next.js 15 + login | apps/portal/* |
| #8 | `feature/mobile-skeleton` | Expo SDK 51 + login | apps/mobile/* |

Tất cả merged squash, branch tự xóa. `gh pr list --state merged` = 8 items.

### 5. Prompts đáng học lại cho Day 2+

- **Prompt validate schema trước khi gen code**: "Trước khi sinh NestJS module, đọc `docs/erd.md §3 model X` và `docs/api-spec.md §Y` + confirm bảng có chứa đủ field cần cho endpoint, báo lại field thiếu." — tránh AI tự thêm field không có trong schema.
- **Prompt per-feature branch**: "Sinh code cho feature Z vào branch `feature/<scope>`, chỉ stage files thuộc feature này, không stage files khác đang untracked." — tránh bundle.
- **Prompt evolve AppModule**: "Khi thêm module mới, update AppModule imports qua commit riêng trong cùng PR, không phải PR scaffold." — show dependency chain.

### 6. Gì chưa làm (Day 2+ carry-over)

- [ ] Unit test `AuthService.login` (happy + 3 sai) — đã liệt kê trong sprint-plan Day 1 §1.5 nhưng skip để ưu tiên scaffold
- [ ] E2E smoke `POST /auth/login → GET /auth/me`
- [ ] Husky hooks wire commit-msg (commitlint) + pre-commit (lint-staged) — config có sẵn, chưa install hooks
- [ ] Branch protection main/develop trên GitHub (require PR, 1 review)
- [ ] README section "Scale strategy" narrative chi tiết hơn (docs/spec.md §8 đã có, README mới link qua)

### 7. Repo URL

https://github.com/thphuc273/smart-attendance (private)

---

## Session #004 — 2026-04-16 — Sprint 1 review + tests + branch protection

### Prompt gốc

> "review, viết test cho sprint 1 và bật branch protection"
>
> Follow-up 1: "tạo nhánh và push github theo từng feature chi tiết, không được chung chung" (AI đã lặp lại lỗi delete-branch after merge → feature branches invisible on GitHub)
> Follow-up 2: "tại sao trên github không thấy branch của feature tương ứng trong sprint 1, kiếm tra lại trước khi tiếp tục"
> Follow-up 3: "thôi tiếp tục sửa code và review code sprint 1 ở trên"

### 1. Review phương pháp

Thay vì review một mình (dễ bỏ sót), AI đã spawn **Explore subagent** để có cặp mắt độc lập. Prompt tới subagent liệt kê trước các vấn đề AI đã tự tìm ra, yêu cầu skip và chỉ báo issues *không* trùng. Kết quả:
- Subagent tìm thêm **4 critical** (CORS reflecting + credentials, Swagger exposed in prod, no Cache-Control on auth, /auth/me contract miss `employee` key)
- **3 high** (HTTP 201 cho POST create, password complexity, refresh error code)
- **5 minor** (unused sort field, seed transaction atomicity, etc.)

Hiệu quả parallel review: AI đã tự thấy 6 issues; subagent tìm thêm 6 issues unique. Tổng 12. Fix 7 cái trong scope Day 1.

### 2. Quyết định kỹ thuật

| # | Câu hỏi | Quyết định | Rationale |
|---|---|---|---|
| 1 | Fix review issues riêng hay gộp? | 1 PR `feature/review-fixes-sprint-1` gom 7 fix | Cùng chủ đề "review follow-up", review overhead thấp hơn tách. |
| 2 | Test strategy | Unit (mocked Prisma) + E2E (mocked Prisma + supertest, full HTTP stack) | Real DB e2e cần Testcontainers → setup 30+ phút. Mocked e2e đã cover pipe/guard/filter/interceptor wiring. Real DB e2e chờ Day 2 khi schema ổn. |
| 3 | argon2 mock | `jest.mock('argon2', () => ({...}))` thay vì `jest.spyOn` | `argon2.verify` là non-configurable property → spyOn fail trên call thứ 2. Module mock stable hơn. |
| 4 | E2E env setup | `test/setup-env.ts` chạy trước module load qua `setupFiles` | `env.validation` (class-validator) throw nếu thiếu var — phải set trước AppModule import. |
| 5 | E2E appFactory | Mirror `main.ts` bootstrap y hệt (pipes, guards, interceptor, Cache-Control middleware) | E2E chỉ có giá trị nếu stack identical với production. |
| 6 | Branch protection strictness | main: 1 approval + linear history + conversation resolution; develop: 0 approval + PR required + linear | Solo dev: main phải strict (chống push tay), develop giữ iteration speed. Linear history match squash-merge. |
| 7 | Delete branch after merge | **Không dùng `--delete-branch`** từ PR #10 trở đi | Felix push back: branches phải visible trên GitHub để làm evidence Git Flow (15% điểm). Grader vào tab Branches thấy đầy đủ `feature/*` đã merged. |

### 3. Sai lầm và fix

**Sai lầm 4 (lặp từ session #003): Dùng `--delete-branch` khi merge PRs #1–#9**
- Git Flow evidence (tab Branches) trống — chỉ còn main + develop. Felix yêu cầu giữ lại.
- Fix: từ PR #10 trở đi merge không `--delete-branch`. Branches cũ đã mất → để yên (PR history vẫn còn ở tab Pull Requests, commit message chứa `(#N)` dẫn back).
- **Bài học**: Evidence cho grader ≠ clean repo. Với 5-day đánh giá, ưu tiên visibility hơn tidiness. CLAUDE.md §6.1 không yêu cầu xóa branch sau merge — đó là default của `gh pr merge` thôi.

**Sai lầm 5: sed in-place xóa trắng file test spec**
- Chạy `sed -i '' "s/...pattern..."` trên macOS xóa hết nội dung file `auth.service.spec.ts` (0 bytes).
- Fix: rewrite file hoàn toàn bằng Write tool.
- **Bài học**: Với refactor phức tạp, dùng `Edit` tool thay vì sed. Nếu phải sed, test trên 1 file copy trước. Chưa rõ root cause — có thể do pattern escape issue với macOS BSD sed. Không điều tra thêm vì rewrite nhanh hơn.

**Sai lầm 6: Test password quá ngắn**
- E2E test case "wrong password → 401" dùng password `"wrong"` (5 chars) → bị `@MinLength(6)` reject 400 trước khi vào controller → test expected 401, actual 400, fail.
- Fix: dùng `"wrongpass"` (8 chars). Pass qua DTO, vào service, argon2.verify false, reject 401.
- **Bài học**: Khi test failure path, nhớ mọi lớp validation trước đó phải pass để path target được reach.

### 4. Files & PRs

| PR | Branch | Scope | Files | Tests |
|---|---|---|---|---|
| #10 | `feature/review-fixes-sprint-1` | 7 security + spec fixes | 7 files (main.ts CORS/Swagger/Cache, branches ensureExists, @HttpCode 201, getMe employee:null, Dockerfile, .env.example) | — |
| #11 | `feature/api-unit-tests` | Unit tests | 4 specs | **34 pass** (AuthService 8, BranchesService 14, RolesGuard 5, BranchScopeGuard 7) |
| #12 | `feature/api-e2e-tests` | HTTP e2e | 5 files (config + factory + env + 2 specs) | **15 pass** (Auth 6, Branches 9) |
| #13 | `chore/branch-protection` | Protection script | 1 file | Script applied live to repo |

**Tổng: 49 tests green, ~4s total.**

### 5. Commands đáng note

```bash
# Apply/restore branch protection idempotently
./scripts/setup-branch-protection.sh [owner/repo]

# Verify
gh api repos/thphuc273/smart-attendance/branches/main/protection | jq '.required_linear_history.enabled'  # → true
```

### 6. Gì chưa làm (Day 2+ carry-over)

- [ ] Real PostgreSQL e2e (Testcontainers) — Day 2 khi có Employee table mới làm
- [ ] CI workflow GitHub Actions — chạy `pnpm test` + `pnpm test:e2e` trên PR — Day 3 (dọc đường hoàn tất MVP)
- [ ] Husky hooks wire — config sẵn, install pending
- [ ] Password complexity rule (agent finding #5) — defer, MVP chấp nhận MinLength(6)
- [ ] Seed transaction atomicity (agent finding #12) — low risk, skip

```
## Session #00X — YYYY-MM-DD — <tiêu đề ngắn>

### Prompt gốc
> "..."

### Hành động
- Bước 1
- Bước 2

### Quyết định
| # | Câu hỏi | Lựa chọn | Lý do |

### File thay đổi
- `path/to/file` — mô tả

### Kết quả
- Cái gì đã chạy / test pass
- Cái gì còn treo

### Follow-up
- [ ] TODO 1
```

---

## Session #005 — 2026-04-16 — Day 2 Sprint: Employees, Devices, Core Check-in/Check-out

### Prompt gốc

> "Bắt đầu sprint 2"
>
> Follow-up: "review và test code của sprint 2, cập nhật PROMPT_LOG"

### 1. Research (trước khi sinh code)

Đã đọc lại toàn bộ codebase Day 1:
- Prisma schema v1 (10 models Day 1), seed.ts (admin + schedule)
- NestJS modules: auth (login/refresh/me), branches (CRUD + wifi + geofence)
- AppModule wiring, guards (JWT, Roles, BranchScope), interceptors, filters
- Test infrastructure: `app-factory.ts`, `setup-env.ts`, e2e pattern (mocked Prisma + supertest)
- `docs/sprint-plan.md` Day 2 scope, `docs/erd.md` Day 2 tables, `docs/api-spec.md §4-5`

### 2. Quyết định kỹ thuật

| # | Câu hỏi | Quyết định | Rationale |
|---|---|---|---|
| 1 | Trust score rule engine | **Pure function** `calculateTrustScore()` tách riêng `src/common/utils/trust-score.ts` | Spec §5.2 scoring phức tạp (GPS tiers, WiFi, device trust, penalties). Pure function dễ unit test 100% mà không cần DB mock |
| 2 | GPS validation engine | **Haversine formula** trong `src/common/utils/geo.ts` | MVP không cần Vincenty. Haversine sai <0.3% ở kc <50km, đủ cho geofence 100-200m |
| 3 | WiFi matching strategy | BSSID exact match (case-insensitive) > SSID fallback | BSSID chống SSID spoofing; SSID-only cho +15 thay vì +35; flag `ssid_only_match` |
| 4 | Shared utils location | `apps/api/src/common/utils/` thay vì `libs/shared/utils/` | Day 2 chỉ API cần; refactor sang monorepo lib Day 3 khi mobile cần |
| 5 | Multi-branch check-in | Scan ALL assigned branches (primary + active assignments) | Employee có thể check-in ở branch phụ (temporary assignment), không chỉ primary |
| 6 | Device auto-register | `upsert` trên `(employeeId, deviceFingerprint)` mỗi check-in | Không bắt nhân viên register device trước — UX mượt hơn, device mới `is_trusted=false` mặc định |
| 7 | Session idempotency | UNIQUE `(employeeId, workDate)` + check existing success events | Check-in 2x → nếu đã có success event → 409 `ALREADY_CHECKED_IN`. Nếu chỉ có failed events → cho phép retry |
| 8 | Failed attempt logging | **Luôn log** vào `attendance_events` trước khi throw | Failed events quan trọng cho audit trail và anti-fraud analysis. Transaction đảm bảo event luôn được persist |
| 9 | Overtime calculation | `workedMinutes` = checkout - checkin; overtime = checkout - scheduled_end (nếu > threshold) | Spec §4.2: overtime chỉ tính khi quá `overtime_after_minutes` (default 60min) so với giờ kết thúc |
| 10 | Check-out status logic | `early_leave` nếu checkout < scheduled_end; `overtime` nếu vượt threshold | Status cuối cùng phụ thuộc cả check-in (on_time/late) lẫn check-out timing |

### 3. Thiết kế check-in flow (minh họa cho spec §4.1)

```
JWT token → identify employee → load assigned branches
    ↓
For each branch:
  ├─ GPS: isInsideGeofence(point, geofence[]) → gpsValid
  └─ WiFi: isBssidWhitelisted(bssid, configs[]) → bssidMatch
    ↓
gpsValid OR bssidMatch OR ssidOnlyMatch → validationPassed
    ↓
calculateTrustScore({gps, wifi, device, mock_location})
    ↓
upsertDevice (auto-register) → check existing session
    ↓
$transaction: create/update session + create event
    ↓
if (!validationPassed) → 422 INVALID_LOCATION (event already logged)
if (validationPassed) → 201 { session_id, trust_score, status }
```

### 4. File thay đổi

**Schema & data:**
| File | Thay đổi |
|---|---|
| `apps/api/prisma/schema.prisma` | +7 enums, +5 models (Employee, EmployeeBranchAssignment, EmployeeDevice, WorkScheduleAssignment, AttendanceSession, AttendanceEvent), back-relations on User/Branch/Department/WorkSchedule |
| `apps/api/prisma/seed.ts` | Mở rộng từ 1 admin → 3 branches + 30 employees + manager + geofences/WiFi + schedule assignments + 1 trusted device |

**Shared utils (pure functions, fully testable):**
| File | Functions |
|---|---|
| `src/common/utils/geo.ts` | `haversineDistance()`, `isInsideGeofence()`, `distanceToGeofence()` |
| `src/common/utils/wifi.ts` | `isBssidWhitelisted()`, `isSsidMatch()` |
| `src/common/utils/trust-score.ts` | `calculateTrustScore()` — GPS tiers (+40/+25), BSSID (+35), SSID-only (+15), device trust (+15), mock (-50), poor accuracy (-15) |

**Employees module (6 endpoints):**
| File | Description |
|---|---|
| `src/modules/employees/employees.module.ts` | NestJS module |
| `src/modules/employees/employees.controller.ts` | 6 routes with RBAC guards |
| `src/modules/employees/employees.service.ts` | CRUD + assignments + device management, atomic User+Employee creation |
| `src/modules/employees/dto/employee.dto.ts` | CreateEmployee, UpdateEmployee, CreateAssignment, ToggleDeviceTrust DTOs |
| `src/modules/employees/dto/list-employees.dto.ts` | Pagination + filter (branch/dept/status/search) |

**Attendance module (2 endpoints):**
| File | Description |
|---|---|
| `src/modules/attendance/attendance.module.ts` | NestJS module |
| `src/modules/attendance/attendance.controller.ts` | check-in (201), check-out (200) |
| `src/modules/attendance/attendance.service.ts` | Full validation flow: GPS/WiFi → trust score → session management |
| `src/modules/attendance/dto/check-in.dto.ts` | GPS coords, WiFi info, device fingerprint, mock location flag |

**Wiring & updates:**
| File | Thay đổi |
|---|---|
| `src/app.module.ts` | +EmployeesModule, +AttendanceModule |
| `src/modules/auth/auth.service.ts` | `getMe()` giờ populate `employee` field từ Employee model thay vì hardcode `null` |

**Tests (30 new):**
| File | Tests |
|---|---|
| `src/common/utils/geo.spec.ts` | 9 tests — haversine, inside/outside/boundary geofence |
| `src/common/utils/wifi.spec.ts` | 9 tests — BSSID case-insensitive, SSID, inactive, null |
| `src/common/utils/trust-score.spec.ts` | 12 tests — all scoring rules, penalties, clamping, trust levels |

### 5. Code review findings

Đã review toàn bộ Sprint 2 code. Kết quả:

| Category | Finding | Status |
|---|---|---|
| Security | Employees module vẫn dùng đúng `JwtAuthGuard` + `RolesGuard` + BranchScopeGuard pattern | ✅ |
| Security | Attendance endpoints chỉ cho role `employee` | ✅ |
| Data | Failed check-in attempts luôn được log trước khi throw | ✅ |
| Data | Device auto-register dùng `upsert` atomic (no race condition) | ✅ |
| Data | Session UNIQUE constraint (employeeId, workDate) chống duplicate | ✅ |
| Data | Employee creation dùng `$transaction` atomic (User + Employee + Role) | ✅ |
| Logic | Trust score clamp 0-100, trust level thresholds correct | ✅ |
| Logic | Multi-branch scan tìm branch match tốt nhất (GPS ưu tiên, fallback WiFi) | ✅ |
| Contract | AllExceptionsFilter đã handle 422 → `UNPROCESSABLE` code | ✅ |
| Contract | DTOs có proper validation (`@IsUUID`, `@IsEmail`, `@Min`, `@Max`) | ✅ |

**Không phát hiện critical/high issues.**

### 6. Kết quả test

```
Test Suites: 7 passed, 7 total
Tests:       64 passed, 64 total
Time:        3.032s

Build:       npx nest build → 0 errors
```

Breakdown:
- **Day 1 tests (34):** auth.service 8, branches.service 14, roles.guard 5, branch-scope.guard 7
- **Day 2 tests (30):** geo 9, wifi 9, trust-score 12

### 7. Gì chưa làm (Day 3+ carry-over)

- [ ] Run `prisma migrate dev` khi có DB running
- [ ] Run seed mở rộng
- [ ] E2E tests cho attendance (check-in valid/invalid/duplicate) — cần mocked attendance service
- [ ] Unit test EmployeesService và AttendanceService (mocked Prisma)
- [ ] Git: tạo feature branches, push, PRs — chờ user confirm workflow
- [ ] Refactor shared utils sang `libs/shared/utils/` khi mobile cần

---

## Session #006 — 2026-04-16 — Day 3 Sprint: History, Dashboard, Seed & Audit

### Prompt gốc

> "Tiếp tục Sprint 3"

### 1. Hành động
- Phân tích `api-spec.md` cho các endpoint lịch sử và dashboard.
- Phân tích `erd.md` để lấy model `DailyAttendanceSummary`.
- Tạo implementation plan, update task.md checklist.
- Cập nhật Prisma Schema:
  - Thêm `DailyAttendanceSummary`.
  - Thêm field `note` vào `AttendanceSession` cho manager override.
  - Sửa lại back-relations.
- Regen Prisma client.
- Cập nhật `seed.ts` để sinh tự động lịch sử điểm danh 7 ngày cho 30 nhân viên (có xen lẫn `on_time`, `late`, `absent`, `missing_checkout` và `failed event`).
- Viết API `AttendanceController` & `AttendanceService`:
  - `GET /attendance/me`
  - `GET /attendance/sessions` (có scope manager)
  - `GET /attendance/sessions/:id`
  - `PATCH /attendance/sessions/:id` (Manager override + tự tạo AuditLog trong transaction).
- Viết API `DashboardController` & `DashboardService`:
  - `GET /admin/overview` (aggregate numbers, top branches, checkin heatmap 24 slot).
  - `GET /manager/:branchId` (branch today stats, low_trust list check, week trend).
- Wiring `DashboardModule` vào `AppModule`.
- Viết Unit Test cho `SessionService.override` (`attendance.service.spec.ts`) để đảm bảo logic override luôn ghi nhận audit.
- Sửa lỗi Typo TypeScript ở `.sort()` function trong hàm dashboard.
- Chạy formatter / compiler check, setup `reset-db.sh` và sửa `README.md`.

### 2. Quyết định
| # | Câu hỏi | Quyết định | Lý do |
|---|---|---|---|
| 1 | Mốc thời gian Heatmap | Dùng thuộc tính hour từ UTC + 7 (Giờ VN) | Cho ra view heatmap đơn giản mà không cầm full date lib (moment/date-fns) |
| 2 | Phân tách Event Override | Ghi vào `note` dạng append `[Date] Override: x` và chèn `AuditLog` với `before/after` payload | Giữ `attendance_events` sạch chỉ cho thiết bị gửi, còn thay đổi admin thì track qua hệ audit để đảm bảo compliance. |

### 3. Kết quả
- Test API override pass tuyệt đối: `AttendanceService - overrideSession` tạo Audit Log và chặn Manager ngoài scope.
- Type check: `npx nest build` Clean.
- Docker flow sẵn sàng để start & dev.

### 4. File thay đổi
- `apps/api/prisma/schema.prisma` — +DailyAttendanceSummary, +note trên Session
- `apps/api/prisma/seed.ts` — Thêm hàm seed 7 ngày
- `apps/api/src/modules/attendance/dto/attendance-history.dto.ts` — Thêm DTO
- `apps/api/src/modules/attendance/attendance.service.ts` — Code core query DB lớn
- `apps/api/src/modules/attendance/attendance.controller.ts` — Expose logic cho HTTP
- `apps/api/src/modules/attendance/attendance.service.spec.ts` — Mock Prisma & run JWT/Guard mock logic override test.
- `apps/api/src/modules/dashboard/...` — Nest Resource cho Dashboard admin/manager
- `scripts/reset-db.sh`, `README.md` — DX improvements

### Follow-up Day 4
- [ ] Chạy lệnh `docker compose up` và manual test endpoint API bằng cURL / Postman.
- [ ] Run Cron/BullMQ cho Day 4 report & closing session.

---

## Session #007 — 2026-04-16 — Day 4 Sprint: Trust Score v2, BullMQ, Reports, UI

### Prompt gốc

> "hãy review 3 pull request hiện tại trên github, sau đó thực hiện merge nếu ok" (Sprint 3 close-out)
>
> Follow-up: "tham khảo tài liệu và tiếp tục sprint 4"
> Follow-up: "ok" (xác nhận plan + các dep mới cho Sprint 4)
> Follow-up: "review và test code của sprint 4, update lại sprint plan xem đã hoan thành như thế nào, huong dan chạy hệ thống"
> Follow-up: "hoàn thành đầy đủ sprint 4, sau đó review và test" (sau khi user phát hiện UI chưa có)
> Follow-up: "cập nhật vào prompt log md"

### 1. Pre-sprint: merge Sprint 3 PRs

- `gh pr list` → 3 PR stacked (#15, #16, #17) — tất cả targeting `develop`, `MERGEABLE`, `CLEAN`.
- Spawn 3 Explore subagents song song review theo từng PR → all LGTM, chỉ 1 non-blocking nit (PR #17 heatmap không đọc từ `daily_attendance_summaries`).
- Squash merge theo thứ tự #15 → #16 → #17. Sau khi #15 merged, #16/#17 cần **rebase** vì squash đã đổi hash của `a6476d3`. Dùng `git rebase origin/develop` — git tự `skipped previously applied commit` (patch-id match) → chỉ commit mới còn lại.
- **Bài học Sprint 3→4**: Khi stack PR và dùng squash-merge, subsequent PRs sẽ conflict → lịch sử. Workflow đúng: `git fetch → git rebase origin/develop → git push --force-with-lease`. Không cần merge conflict tool.

### 2. Sprint 4 plan & dep approval

Đề xuất plan **3 stacked PR backend**:
- PR A (#18) — trust-score v2 + ScheduleService (foundation)
- PR B (#19) — BullMQ cron + `/reports/*` + CSV export
- PR C (#20) — `/dashboard/anomalies` + heatmap refactor

Hỏi user xác nhận deps (CLAUDE.md §7.2 bắt hỏi):
- `@nestjs/bullmq`, `bullmq` — cho cron + queue
- `csv-stringify` — CSV với UTF-8 BOM

User approve với 1 chữ "ok".

Sau khi user thấy UI chưa làm (login xong không có dashboard) → add **PR D (#21)** — portal + mobile UI.

### 3. Quyết định kỹ thuật chính

| # | Câu hỏi | Quyết định | Rationale |
|---|---|---|---|
| 1 | Trust score rule bổ sung thiếu 2 rule spec §5.2 | Thêm `impossibleTravel` (-30) và `vpnSuspected` (-10) inputs vào `TrustScoreInput`, giữ backward-compat bằng optional | Service chỉ cần wire thêm 2 boolean; pure function dễ test thêm |
| 2 | Cách detect impossible travel | Query `attendanceEvent.findFirst` gần nhất có `latitude/longitude NOT NULL`, status=success, trong 6h | Không cần lưu state; event log đã có đủ. 6h đủ span cho 1 ca làm |
| 3 | VPN detection impl | Để `vpnSuspected` luôn `false` ở service, wire input để future GeoIP module có thể inject | Hackathon: không mua GeoIP DB. Interface sẵn sàng mà không block feature |
| 4 | Schedule classifier | Pure `common/utils/schedule.ts` (3 functions) + DB wrapper `ScheduleService` | Separation of concerns: classifier fully testable không DB; service làm DB lookup |
| 5 | `lateMinutes` field placement | Add cột `late_minutes` trên `AttendanceSession` (chưa có) | Daily summary đã có. Per-session cũng cần cho reports detail. |
| 6 | Cron schedule registration | `onModuleInit` trong `ReportsService`, bỏ qua nếu `NODE_ENV=test` | BullMQ repeat jobs dedup theo `jobId` — idempotent giữa restart. Test không cần Redis → skip |
| 7 | Storage CSV output | Column `file_content TEXT` trên bảng `report_exports` | Hackathon scale (max ~150k rows × 11 cols ~= 8MB) fit DB. Không cần S3/filesystem |
| 8 | CSV library | `csv-stringify/sync` thay vì stream API | Sync blocks event loop nhưng Worker chạy trong BullMQ, không block HTTP. Stream phức tạp, chưa cần |
| 9 | Vietnamese UTF-8 | `{ bom: true }` trên csv-stringify | Excel Windows auto-detect BOM → hiển thị đúng dấu. Không cần Latin1 workaround |
| 10 | Export auth ownership | Non-admin chỉ download export của chính mình | Export chứa data employee → rõ ràng scope |
| 11 | Heatmap refactor | `$queryRaw` với `EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')` GROUP BY hour | Tránh loading toàn bộ events vào memory (5k/day). 1 query dùng index `(status, created_at)` |
| 12 | Anomaly spike threshold | `late_rate_today ≥ 5%` AND `spike_ratio ≥ 2×` | Tránh false positive cho chi nhánh nhỏ. "2×" là industry norm cho spike detection |
| 13 | Anomaly employees_low_trust | `groupBy employeeId` + `HAVING count ≥ 3` trong 7 ngày | Prisma 6 hỗ trợ `having` trong groupBy → 1 query thay vì lọc JS |
| 14 | Portal auth layer | `localStorage` + ky `beforeRequest` hook + `afterResponse` 401 redirect | Demo simplicity. Production nên dùng httpOnly cookie |
| 15 | Portal routing | Flat routes `/dashboard`, `/sessions`, `/reports` không group `/(authed)/` | Chỉ 3 pages — group adds indirection không worthwhile |
| 16 | Mobile route types | Cast `'/history' as never` vì `.expo/types/router.d.ts` chưa gen | Route này chỉ gen khi `expo start` chạy. Runtime OK. Comment giải thích |
| 17 | Dashboard tests broken từ #17 | Fix luôn trong PR #20 (thay `should be defined` stub bằng real assertions) | Tránh carrying broken tests vào Sprint 5 |

### 4. Infra fixes (dev-loop bugs phát sinh khi user chạy thật)

Khi user chạy `./scripts/reset-db.sh` và `pnpm dev` xuất hiện chuỗi lỗi → phải debug live:

**Bug 1: `.env` rỗng → Prisma P1012 `DATABASE_URL not found`**
- Root .env file 0 bytes (user mới tạo).
- Fix: populate from `.env.example` + generate JWT secrets bằng `crypto.randomBytes(32).toString('hex')`.

**Bug 2: `reset-db.sh` dùng `prisma migrate reset` nhưng repo không có `migrations/`**
- Sprint 1–3 dev theo pattern "schema as source" (db push, không commit migrations).
- Fix: đổi command thành `prisma db push --force-reset --accept-data-loss`; source root .env vào script; dùng `pg_isready` thay `sleep 3`.

**Bug 3: `Cannot find module dist/main` trong watch mode**
- `deleteOutDir: true` trong nest-cli xóa `dist/`, nhưng `tsconfig.tsbuildinfo` vẫn giữ state "up-to-date" → tsc không emit → `dist/main.js` không tồn tại.
- Fix: set `tsBuildInfoFile: "./dist/.tsbuildinfo"` → incremental cache co-located với emit, cùng bị wipe.

**Bug 4: ConfigModule không tìm `.env`**
- `pnpm --filter @sa/api dev` có cwd là `apps/api/`, ConfigModule chỉ tìm trong cwd, không walk up tới monorepo root.
- Fix: `envFilePath: [join(cwd(), '.env'), join(cwd(), '../../.env')]`.

**Bug 5: CORS chặn LAN IP khi test từ điện thoại**
- Portal chạy `http://192.168.1.166:3100`, ALLOWED_ORIGINS chỉ có `localhost`.
- Fix: trong dev, regex whitelist cho `localhost|127.0.0.1|10.x|192.168.x|172.16-31.x`. Prod vẫn strict.

- **Bài học**: Mỗi bug dev-loop trên chỉ phát hiện khi user chạy thật — không thể catch bằng unit test. Nhớ rằng "118/118 pass + `nest build` xanh" KHÔNG đồng nghĩa "đứng được từ fresh clone". Cần smoke test bằng lệnh `./reset-db.sh && pnpm dev` trên clean env trước khi claim sprint hoàn tất.

### 5. Sai lầm và fix (Sprint 4)

**Sai lầm 7: Khai báo UI là "optional, out-of-scope" rồi đóng sprint**
- Sau PR A/B/C đã claim "Sprint 4 complete". User thử login → không thấy dashboard → hỏi "sao không thấy web admin?".
- Phản ứng đúng lẽ ra: đọc lại sprint-plan §4.4 từ đầu; UI is IN scope of Day 4, không phải "nice-to-have".
- Fix: scaffold PR D (portal + mobile UI) → sprint thực sự done.
- **Bài học**: "Backend done" ≠ "Sprint done". Khi sprint-plan có checkbox UI, không được skip dù scope thoạt nhìn lớn. Hỏi user trước khi defer.

**Sai lầm 8: Viết dead code trong processor**
- Ban đầu thêm `isClosedStatus()` helper ở cuối `daily-summary.processor.ts` nhưng không dùng. Phát hiện ngay trong self-review, xóa.
- **Bài học**: CLAUDE §8 cấm `TODO later`/dead code. Tự review từng file trước khi commit.

**Sai lầm 9: Mobile `StyleSheet.create` chứa function**
- Viết `trust: (score: number) => ({...})` — React Native `StyleSheet.create` expect static object, TS compile OK nhưng runtime style không áp được đúng.
- Fix: extract thành `function trustColor(score)` ngoài StyleSheet, dùng `style={[styles.trustBase, trustColor(score)]}`.
- **Bài học**: StyleSheet.create chỉ chứa literal objects. Dynamic style = spread array hoặc function ngoài.

### 6. File & PR

| PR | Branch | Files | Additions | Tests |
|---|---|---|---|---|
| #18 | `feature/trust-score-schedule` | 12 | +566 | +18 (trust-score, schedule, geo speed) |
| #19 | `feature/reports-bullmq` | 15 | +1274 | +15 (3 processors + ReportsService scope) |
| #20 | `feature/dashboard-manager-anomalies` | 4 | +317 | +9 (fix 2 broken + anomaly spike + heatmap bigint) |
| #21 | `feature/sprint4-ui` | 18 | +1453 | — (manual QA) |

**Tổng Sprint 4 diff vs develop**: 54 files, +3643/-157, +42 API tests.

### 7. Prompts đáng học

- **Plan question trước khi code**: "Đề xuất plan 3 stacked PR + dep list + migration strategy, hỏi user approve" — user đáp "ok" là clean handshake, không cần thảo luận tiếp.
- **Sprint gate**: Đọc sprint-plan §4.X checkbox trước khi commit mỗi PR. Check lại UI checkbox trước khi close sprint (chỗ này mình miss).
- **Subagent parallel review**: Spawn 3 Explore agents cho 3 PR cùng lúc — mỗi agent chỉ focus 1 diff, report về verdict + file:line. Hiệu quả hơn self-review serial.
- **Debug infra khi user báo lỗi**: Đọc exact error message → map sang root cause → fix tận gốc (ví dụ tsbuildinfo + deleteOutDir race thay vì workaround "rm -rf dist mỗi lần").

### 8. Prompts phải sửa

- "Review 3 PR và merge nếu ok" → mình hiểu thành "merge tất cả ngay". Đúng ra nên confirm từng PR trước khi merge (destructive op chạy visible on main). Lần sau sẽ summary review rồi hỏi "OK to merge all 3?".
- "Tiếp tục sprint 4" → ban đầu đề xuất 3 PR backend-only, không hỏi UI. Lần sau đọc kỹ §4.4 trước khi propose scope.

### 9. Kết quả test & build

```
apps/api:    118/118 tests pass · tsc clean · nest build ok
apps/portal: tsc clean · next build ok (6 routes)
apps/mobile: tsc clean (expo-router types stale → cast as never)
```

### 10. Follow-up Day 5

- [ ] Manual smoke test toàn stack sau merge (docker compose + reset-db + API + portal + mobile)
- [ ] Merge 4 PRs theo thứ tự #18 → #19 → #20 → #21 (rebase từng PR lên develop sau khi PR trước squash)
- [ ] PROMPT_LOG review: thêm real prompts/outputs nếu user yêu cầu bằng chứng dense hơn
- [ ] Day 5 zero-tap (sprint-plan §5) — toàn bộ còn nguyên

---

## Session #008 — 2026-04-16 — Sprint 4 hardening: live-test bugs + employee flow

### Prompt gốc (chuỗi)

> "Cannot read properties of undefined (reading 'length')" — dashboard
> "sessions.map is not a function" — sessions page
> "Branches — Day 1 stub" (còn nguyên text stub)
> "Cannot find module './874.js'" — sau khi build rồi dev
> "kiểm tra lại flow của employee khi đăng nhập để vào portal checkin"

Tất cả đều là bug/thiếu feature lộ ra khi user chạy thật — không có cái nào catch được bằng unit test. Đây là bài học lớn nhất của session này.

### 1. Bug #1 — Double data-wrap (dashboard + reports)

**Symptom:** `anomalies.branches_late_spike.length` throw vì `anomalies` là `{ data: {...actual} }` thay vì `{...actual}`.

**Root cause:** `ResponseTransformInterceptor` (main.ts wire) luôn wrap return value trong `{ data: ... }`. Nhưng 5 methods trong Sprint 4 services cũng tự wrap:
- `DashboardService.getAnomalies` → `{ data: {...} }`
- `ReportsService.getDailySummary` / `getBranchReport` / `createExport` / `getExportStatus`

Interceptor wrap lần nữa → `{ data: { data: ... } }` → portal đọc `r.data` = object trong cùng, không có field cần.

**Fix:** Bỏ `{ data: ... }` wrap trong service, return raw object. Interceptor làm phần wrapping. 5 places + 4 spec assertions updated.

### 2. Bug #2 — Pagination shape mismatch (attendance)

**Symptom:** `sessions.map is not a function` khi mở `/sessions`.

**Root cause:** `ResponseTransformInterceptor.isPaginated()` detect paginated response bằng key `items` (không phải `data`):
```ts
'items' in value && Array.isArray(value.items) && 'meta' in value
```
Nhưng `attendance.service.listSessions` và `getMyAttendance` (Sprint 3) return `{ data: [...], meta }` → interceptor coi là non-paginated, wrap thêm → `{ data: { data: [...], meta } }`.

BranchesService và EmployeesService đã dùng `{ items, meta }` từ Sprint 1–2 nên không bị. Đây là outlier Sprint 3.

**Fix:** Rename `data` → `items` trong 3 returns của attendance.service. API contract ra wire không đổi (vẫn `{ data, meta }` sau interceptor).

**Bài học chung 2 bug này:**
- `ResponseTransformInterceptor` có contract ngầm: service return raw object HOẶC `{ items, meta }` — KHÔNG được tự wrap `{ data }`.
- Không có doc comment trên interceptor giải thích contract → mỗi dev reinvent và sai.
- Follow-up nên thêm JSDoc trên interceptor class + helper type `PaginatedResult<T> = { items: T[], meta: PaginationMeta }` để service import dùng đúng shape.

### 3. Bug #3 — Next.js .next/ corruption

**Symptom:** `Cannot find module './874.js'` khi chạy `pnpm dev`.

**Root cause:** Mình chạy `pnpm build` để verify typecheck trong `/portal` (thay vì chỉ `tsc --noEmit`). Production build ghi chunks vào `.next/` với hashes khác hoàn toàn với dev chunks. Khi user restart `pnpm dev`, Next.js dev bundler reuse `.next/` nhưng chunk references mismatch → module not found.

**Fix:** `rm -rf apps/portal/.next && pnpm dev`.

**Bài học:** Đừng chạy `pnpm build` trên portal khi user đang dev. Dùng `npx tsc --noEmit` để verify types mà không touch `.next/`. Tương tự đã học ở Sprint 1 với api `dist/` + `tsconfig.tsbuildinfo` — cùng class bug (build artifacts từ một mode gây nhiễu mode khác).

### 4. Feature gap #1 — Branches còn là Day 1 stub

Day 1 ship trang `/branches` với text "Day 1 stub — sẽ hoàn thiện CRUD UI ở Day 2". Không ai làm Day 2 tiếp → stub vẫn còn nguyên tới Day 4.

**Fix:** Viết đầy đủ CRUD UI portal `/branches` — list filterable + create modal + detail drawer với inline edit, WiFi whitelist add/remove (regex validation BSSID), geofence add/remove, soft-delete. Manager read-only scoped theo `BranchScopeGuard` existing.

**Bài học:** Các stub "Day X" comment là technical debt không visible trong test suite. Cần sweep toàn codebase tìm `stub|TODO|Day 1` trước khi close sprint — đáng kể đó là điều mình đã miss Session #007 (chỉ check UI Sprint 4 §4.4, không check stub cũ).

### 5. Feature gap #2 — Employee infinite redirect + missing check-in

**Symptom:** User thử login `employee001@demo.com` → "portal không cho vào đâu cả".

**Root cause:**
1. Login success → `router.replace('/dashboard')` (hardcoded)
2. `/dashboard` dùng `useRequireAuth('manager')` → employee không match → `router.replace('/dashboard')` (rejected users bị đẩy về `/dashboard`, mà họ đang ở `/dashboard`)
3. **Infinite loop**

Root bug thiết kế: `useRequireAuth` rejected path luôn là `/dashboard` — đúng cho admin/manager nhưng sai cho employee (không có home nào cho employee vì UI employee chưa tồn tại).

**Fix:**
1. Thêm helper `homeFor(user)` trả về `/dashboard` cho manager/admin, `/checkin` cho employee.
2. `useRequireAuth` rejected path → `homeFor(user)` thay vì hardcode.
3. `useRequireAuth('employee')` accept bất kỳ logged-in user (employee + manager + admin).
4. Login `router.replace(homeFor(user))`. Home page `/` tương tự.
5. Nav items filtered — employee chỉ thấy "Check-in".
6. Tạo `/checkin` page mới:
   - Today session card (status + in/out time)
   - 2 nút lớn → `navigator.geolocation.getCurrentPosition` → POST `/attendance/check-in|out`
   - `device_fingerprint = web-<uuid>` lưu localStorage
   - Platform `web`, không có SSID/BSSID (browser không expose)
   - Hiển thị trust score + validation method + risk flags
   - Parse `error.details.distance_meters` khi INVALID_LOCATION
   - Lịch sử 14 ngày bên dưới

**Bài học:** Khi thiết kế guard/routing, luôn test cả 3 path: admin / manager / employee. Session #007 mình chỉ test admin và manager khi write `useRequireAuth`. Employee case chỉ lộ khi user thực sự login.

### 6. Sai lầm và fix (Session #008)

**Sai lầm 10: Chạy `pnpm build` khi portal đang dev**
- Để verify "portal builds clean" → chạy `pnpm build` → corrupt `.next/`
- Fix: rm -rf + restart. Lần sau dùng `npx tsc --noEmit`.

**Sai lầm 11: "Sprint 4 UI done" nhưng quên role employee**
- PR #21 claim UI done, nhưng chỉ 3 pages cho admin/manager (dashboard/sessions/reports). Employee role hoàn toàn không có entry point → vô nghĩa với 30 seeded employees.
- Fix: PR #21 bổ sung `/checkin` + routing role-aware (chưa mở PR mới, push thẳng vào #21 vì cùng UI scope).
- Bài học: "Completeness check" trước khi claim sprint done — phải test từng role actor được design trong spec (admin, manager, employee) chứ không chỉ happy-path admin.

**Sai lầm 12: Service wrapping `{ data }` không theo contract**
- Cùng lỗi ở 5 endpoints. Root cause: copy-paste service pattern từ 1 file sang file khác mà không check wire format.
- Fix: bỏ wrap. Long-term: doc comment trên `ResponseTransformInterceptor`.
- Bài học: Contract ngầm (implicit) giữa interceptor và service rất dễ drift. Viết types tường minh (ví dụ `PaginatedResult<T>`) để compiler enforce.

### 7. File & commit (push thêm vào PR #21)

| Commit | Scope | Files |
|---|---|---|
| `b5e06fe` | fix(api): double data-wrap dashboard + reports | 4 files, +53 -63 |
| `0f05f41` | fix(attendance): rename data→items paginated | 1 file, +4 -4 |
| `11045d1` | feat(portal): branches CRUD UI | 1 file, +862 -5 |
| `906749a` | feat(portal): employee check-in flow + fix redirect | 5 files, +332 -10 |

Tổng PR #21 giờ: 23 files changed, +2813 lines.

### 8. Kết quả

```
apps/api:    118/118 tests pass (sau khi update 4 spec assertions)
apps/portal: tsc clean; 7 routes: / /login /dashboard /sessions /reports /branches /checkin
apps/mobile: không thay đổi
```

### 9. Follow-up

- [ ] Thêm JSDoc + `PaginatedResult<T>` type trên `ResponseTransformInterceptor` để compiler enforce contract — tránh lặp bug double-wrap
- [ ] Mobile app cũng chưa có check-in screen (chỉ có /history). Song song với `/checkin` portal, mobile cần 1 screen tương tự nhưng có WiFi SSID/BSSID (qua `expo-network` + native module).
- [ ] Admin cần 1 nút "Toggle device is_trusted" trong UI employee detail — hiện chỉ có API, chưa UI
- [ ] E2E test cho flow employee web check-in → history rendering — cần Testcontainers + Playwright


