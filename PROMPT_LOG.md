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

## Template cho session tiếp theo

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
