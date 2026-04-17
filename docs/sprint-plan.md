# SMART ATTENDANCE — 6-DAY SPRINT PLAN

> **Lead:** Felix (Backend + AI Engineer) · **Role:** PM + Architect · **Tuần:** 2026-04-16 → 2026-04-23
> **Stack chốt (docs v0.2):** NestJS + Prisma + PostgreSQL 16 + Redis/BullMQ · Mobile = **Expo SDK 51 + React Native** · Portal = **Next.js 15 + shadcn/ui** · Nx monorepo · Docker Compose.
> **Nguồn chân lý:** `docs/spec.md` (§11 MVP), `docs/erd.md`, `docs/api-spec.md`, `docs/CLAUDE.md`.
>
> **Nguyên tắc sprint:** Mỗi ngày kết thúc bằng `docker compose up` chạy được + ghi `PROMPT_LOG.md`. Không merge feature sang `develop` nếu chưa có test + review 100% code AI sinh ra.

---

## Day 1 — Foundation, Auth, Branch CRUD

**Mục tiêu:** Hạ tầng chạy được, login 3 role, quản lý chi nhánh + WiFi/Geofence config.
**DoD:** `docker compose up` → login `admin@demo.com` → tạo branch + 1 wifi + 1 geofence qua API.

### 1.1 Infra & monorepo
- [x] Khởi tạo Nx workspace `smart-attendance` (TypeScript preset)
- [x] Tạo `apps/api` (NestJS), `apps/portal` (Next.js 15), `apps/mobile` (Expo)
- [x] Tạo `libs/shared/types`, `libs/shared/constants`, `libs/shared/utils`, `libs/api/*`
- [x] `.env.example` đầy đủ (DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, PORT)
- [x] `docker-compose.yml`: `postgres:16`, `redis:7`, `api` (multi-stage Dockerfile), volumes persist
- [x] `Dockerfile` multi-stage cho `apps/api` (deps → build → runtime)
- [x] ESLint + Prettier + Husky pre-commit + Conventional Commits check (commitlint)
- [x] Git flow init: `main`, `develop`, branch `feature/day1-foundation`

### 1.2 Database (Prisma migration #1)
**Bảng cần tạo (tham chiếu `docs/erd.md` §3):**
- [x] `users`, `roles`, `user_roles`
- [x] `branches`, `departments`
- [x] `branch_wifi_configs`, `branch_geofences`
- [x] `work_schedules` (tạo bảng, seed 1 ca chuẩn 08–17)
- [x] `audit_logs`
- [x] Seed: 3 roles (`admin`, `manager`, `employee`), 1 admin `admin@demo.com / Admin@123`

### 1.3 API endpoints (`docs/api-spec.md` §2, §3)
- [x] `POST /auth/login` — JWT access + refresh, rate limit 5/phút/IP
- [x] `POST /auth/refresh`
- [x] `POST /auth/logout`
- [x] `GET /auth/me`
- [x] `JwtAuthGuard` + `RolesGuard` + `BranchScopeGuard` + `@CurrentUser()` decorator
- [x] `ResponseTransformInterceptor` (chuẩn hoá `{ data, meta }`)
- [x] Global exception filter (format lỗi `{ error: { code, message, details } }`)
- [x] `GET|POST|PATCH|DELETE /branches` (pagination, filter `status`, `search`)
- [x] `GET|POST|DELETE /branches/:id/wifi-configs`
- [x] `GET|POST /branches/:id/geofences`
- [x] Swagger tại `/api/docs`

### 1.4 UI
- [x] **Portal (Next.js):** login page + layout, branch list + form tạo/sửa branch + sub-form WiFi/Geofence (shadcn Form + zod)
- [x] **Mobile (Expo):** khởi tạo expo-router, splash + login screen (react-hook-form + zod), lưu token vào `expo-secure-store`
- [x] API client wrapper ở `libs/shared/api-client` (dùng chung mobile + portal)

### 1.5 Test
- [x] Unit: `AuthService.login` (happy + wrong password), `BranchService.create` (duplicate code 409)
- [x] E2E: `POST /auth/login` → `GET /auth/me` với token trả về

### 1.6 End-of-day
- [x] PR `feature/day1-foundation` → `develop` (1 PR, self-review, squash merge)
- [x] Ghi `PROMPT_LOG.md` Session #003: prompt sinh skeleton module, prompt sinh migration đầu, prompt sinh BranchScopeGuard — kèm diff review

---

## Day 2 — Employees, Devices, Core Check-in/Check-out

**Mục tiêu:** Nhân viên login được, check-in qua GPS HOẶC WiFi, log `attendance_events`.
**DoD:** Từ mobile: login `employee001@demo.com` → bấm check-in → tạo session + event status `success`.

### 2.1 Database (Prisma migration #2)
- [x] `employees`, `employee_branch_assignments`
- [x] `employee_devices` (MVP: chưa cột zero-tap, sẽ thêm Day 5)
- [x] `attendance_sessions` (UNIQUE `(employee_id, work_date)`)
- [x] `attendance_events` (index theo `session_id, created_at` và `employee_id, created_at`)
- [x] `work_schedule_assignments`
- [x] Seed: 30 employees (10/branch), password `Employee@123`, gán department + primary_branch

### 2.2 API endpoints (`docs/api-spec.md` §4, §5)
- [x] `GET|POST|PATCH /employees` (admin all, manager own-branches)
- [x] `POST /employees/:id/assignments` (secondary/temporary)
- [x] `GET /employees/:id/devices`
- [x] `PATCH /employees/:id/devices/:deviceId` (toggle `is_trusted`)
- [x] **`POST /attendance/check-in`** — validation layer 1 (GPS geofence OR BSSID whitelist), layer 2 (risk flags), trust_score MVP (không full rule, Day 4 hoàn thiện)
- [x] **`POST /attendance/check-out`** — update `check_out_at`, `worked_minutes`
- [x] Rate limit `/check-in`, `/check-out`: 10/phút/employee (Redis)
- [x] `libs/shared/utils/geo.ts` — pure function Haversine + point-in-circle
- [x] `libs/shared/utils/trust-score.ts` — khung hàm thuần, trả score MVP

### 2.3 Logic nghiệp vụ
- [x] Tự động auto-register device khi fingerprint lần đầu gặp (is_trusted=false)
- [x] Idempotent: check-in lần 2 cùng ngày → ignore nếu lần đầu success, update nếu fail
- [x] Error mapping: `INVALID_LOCATION` (422), `ALREADY_CHECKED_IN` (409), `NOT_ASSIGNED_TO_BRANCH` (422)
- [x] Mọi failed attempt **vẫn ghi** `attendance_events` với `status=failed`

### 2.4 UI
- [x] **Mobile (Expo):**
  - [x] Quyền: `expo-location` foreground + Android `NEARBY_WIFI_DEVICES`, iOS NEHotspot entitlement (config qua `expo-build-properties`)
  - [x] Màn hình Check-in: hiển thị branch + trạng thái hôm nay + nút Check-in/Check-out to, loading + result toast
  - [x] Thu thập: GPS (accuracy), SSID/BSSID, device fingerprint (expo-device + expo-crypto)
  - [x] EAS Build dev client (không dùng Expo Go vì cần native module)
- [x] **Portal (Next.js):** Trang Employees list + filter theo branch/department + form tạo nhanh

### 2.5 Test
- [x] Unit: `geo.isInsideGeofence`, `wifi.isBssidWhitelisted`, trust score MVP
- [ ] E2E: check-in hợp lệ → 201, check-in ngoài geofence + sai BSSID → 422, check-in lần 2 → 409
- [ ] E2E: manager không thấy employee branch khác → 403

### 2.6 End-of-day
- [x] PR `feature/day2-attendance-core` → `develop`
- [x] `PROMPT_LOG.md` Session #004: prompt cho trust-score pure function, prompt tạo validation service, prompt Expo check-in screen — ghi lại chỉnh sửa

---

## Day 3 — History, Dashboard Admin, Seed đầy đủ, Docker polish

**Mục tiêu:** MVP must-have đóng gói gọn. Demo end-to-end chạy được.
**DoD:** Admin login portal → thấy dashboard thống kê; Employee mobile thấy lịch sử 7 ngày.

### 3.1 Database (Prisma migration #3)
- [x] `daily_attendance_summaries` (UNIQUE `(employee_id, work_date)`)
- [x] Seed **7 ngày attendance data**: mix status (on_time/late/absent), trust score cao/thấp, 1 missing_checkout, 1 failed event
- [x] Hoàn thiện test accounts: `admin@demo.com`, `manager.hcm@demo.com` (gán 1 branch), `employee001@demo.com`

### 3.2 API endpoints
- [x] `GET /attendance/me?date_from&date_to` (pagination, filter theo month)
- [x] `GET /attendance/sessions` (manager/admin, filter branch/employee/date/status)
- [x] `GET /attendance/sessions/:id` (trả session + events list)
- [x] `PATCH /attendance/sessions/:id` (manager override, **bắt buộc** audit log `before/after`)
- [x] `GET /dashboard/admin/overview` (total_employees, today stats, top branches, checkin_heatmap)
- [x] Redis cache: branch config TTL 5', dashboard aggregate TTL 60s

### 3.3 UI
- [x] **Mobile:** màn hình Lịch sử (list theo ngày, badge status, trust score color)
- [ ] **Mobile:** màn hình Chi tiết session (events list + map marker nếu có GPS)
- [x] **Portal:** trang Sessions (filter, table server-side pagination, modal chi tiết + nút override cho manager/admin)
- [x] **Portal:** Admin Dashboard (stat cards + top branches + heatmap dùng Recharts)

### 3.4 Docker & DX
- [x] `docker compose up` 1 lệnh → api + postgres + redis + portal dev sẵn sàng
- [x] `scripts/reset-db.sh`: migrate + seed idempotent
- [x] README root: setup guide, cấu trúc, lệnh chạy, test accounts (cho bài nộp)
- [x] `.env.example` sync với tất cả dịch vụ

### 3.5 Test
- [x] Unit: `SessionService.override` tạo audit_log đúng format
- [ ] E2E: golden path — login admin → list sessions → override → audit log xuất hiện trong `GET /audit-logs`
- [ ] Coverage ≥ 60% cho `libs/api/attendance`

### 3.6 End-of-day
- [x] PR `feature/day3-history-dashboard` → `develop`, tag `v0.1.0-mvp`
- [x] `PROMPT_LOG.md` Session #005: prompt sinh audit interceptor, prompt dashboard aggregate query SQL — note hiệu suất
- [ ] **Cut-off Must-have** ✅ — MVP mục `11.Must-have` đóng

---

## Day 4 — Should-have: Trust Score full, Cron, Manager, CSV Export

**Mục tiêu:** Chất lượng nghiệp vụ + báo cáo + dashboard manager.
**DoD:** Export CSV tháng 4 cho 1 branch; cron 00:30 chạy tự động tạo summary.

> **Trạng thái (2026-04-16):** Day 4 hoàn thành — 4 stacked PRs (#18, #19, #20, #21) mở trên `develop`. Backend: 118/118 unit tests pass, `tsc --noEmit` clean, `nest build` xanh. Portal + mobile: typecheck clean, `next build` xanh.

### 4.1 Database (Prisma migration #4)
- [x] Thêm cột `late_minutes` vào `attendance_sessions` (PR #18) — `overtime_minutes` đã có từ Day 2
- [x] Thêm bảng `report_exports` cho CSV export job state (PR #19)
- [x] Index `attendance_events (status, created_at)` (đã có từ Day 2 schema)

### 4.2 Logic nghiệp vụ
- [x] `trust-score.ts` đủ 10 rule (PR #18): thêm `impossible_travel` (-30) + `vpn_suspected` (-10) — VPN input hiện trả `false` từ service, sẵn sàng wire khi GeoIP module bổ sung
- [x] `ScheduleService` (PR #18): resolve ca hiện tại từ `work_schedule_assignments` + pure classifier (`classifyCheckIn` / `classifyCheckOut` / `isWorkday`)
- [x] Phân loại status đủ 4 nhóm: `on_time | late | early_leave | overtime` (PR #18). `missing_checkout` do cron BullMQ §4.2 đảm nhận
- [x] BullMQ jobs (PR #19):
  - [x] `missing-checkout-close` (cron `59 23 * * *`, idempotent — `updateMany` loại trừ `missing_checkout` đã đóng)
  - [x] `daily-summary` (cron `30 0 * * *`, idempotent upsert vào `daily_attendance_summaries`)
  - [x] `report-export` (on-demand, attempts=3, exponential backoff)

### 4.3 API endpoints (`docs/api-spec.md` §6, §7)
- [x] `GET /reports/daily-summary` (filter branch/dept/date) — PR #19
- [x] `GET /reports/branch/:id` (aggregate period + status breakdown) — PR #19
- [x] `POST /reports/export` → 202 + `job_id` — PR #19
- [x] `GET /reports/export/:jobId` (status + download_url) — PR #19
- [x] `GET /reports/export/:jobId/download` (CSV + UTF-8 BOM) — PR #19
- [x] `GET /dashboard/manager/:branchId` (today stats + low_trust_today + week_trend) — đã có từ #17
- [x] `GET /dashboard/anomalies` (branches_late_spike + employees_low_trust + new untrusted devices) — PR #20 (spec sprint-plan §5.2 — kéo sớm Day 4)
- [x] Rate limit `POST /reports/export`: 3/phút/user (PR #19, dùng `@nestjs/throttler` scope riêng)
- [x] Manager branch-scope enforced ở mọi endpoint mới

### 4.4 UI
- [x] **Portal — Dashboard** (`/dashboard`): stat cards (employees/branches/today/on-time rate), status breakdown, top branches on-time & late, 24h heatmap, **Anomaly cards** (late spikes + low-trust employees + new untrusted devices). Admin sees overview; manager sees anomalies scoped to their branches — PR #21
- [x] **Portal — Sessions** (`/sessions`): filterable table (status, date range) với pagination + **Override modal** (note ≥3 ký tự, ghi audit log) — PR #21
- [x] **Portal — Reports** (`/reports`): daily summary table + form filter + **CSV export** (enqueue BullMQ → poll mỗi 1.2s → download blob) — PR #21
- [x] **Portal — Branches** (`/branches`): CRUD đầy đủ + WiFi whitelist + geofence (thay Day 1 stub) — PR #21
- [x] **Portal — Check-in** (`/checkin` cho employee role): GPS-based web check-in với device fingerprint + trust score display — PR #21
- [x] **Portal — Employees** (`/employees`): list + create + detail drawer với edit, devices toggle trust, branch assignments — PR #22
- [x] **Portal — Schedules** (`/schedules`): card grid + create modal + assignments drawer — PR #23
- [x] **Portal — Audit logs** (`/audit-logs`): filterable table với expandable before/after JSON diff — PR #24
- [x] **Portal — Monthly summary** trên `/checkin`: 8 stat tiles (on-time/late/absent/missing/total worked/OT/late/days) — PR #24
- [x] **Mobile — History** (`/history`): list sessions với late/overtime badges, trust-score color-coded, pull-to-refresh, tap → session detail — PR #21 + PR #25
- [x] **Mobile — Check-in** (`/checkin`): GPS + device fingerprint + trust result display (expo-location + expo-device) — PR #25
- [x] **Mobile — Session detail** (`/session/[id]`): session meta + events timeline với validation method, GPS, WiFi, risk flags — PR #25
- [x] Auth layer chung: portal `useRequireAuth` + ky client với Bearer + 401 redirect; mobile `expo-secure-store` + typed env — PR #21

### 4.5 Test
- [x] Unit: trust-score 15 test (bao gồm 2 rule mới + combined penalties) — PR #18
- [x] Unit: schedule classifier 12 test (grace boundary, early_leave, overtime, workday) — PR #18
- [x] Unit: ScheduleService resolver (3 test, bao gồm malformed workdays JSON) — PR #18
- [x] Unit: `haversineSpeedKmh` (4 test, bao gồm impossible travel) — PR #18
- [x] Unit: `daily-summary` processor idempotent (3 test) — PR #19
- [x] Unit: `missing-checkout` processor (2 test, idempotent check) — PR #19
- [x] Unit: `report-export` processor CSV format + BOM + failure branch (2 test) — PR #19
- [x] Unit: `ReportsService` scope + expiry + ownership (7 test) — PR #19
- [x] Unit: `DashboardService` anomaly detection + heatmap bigint coercion (6 test) — PR #20
- [ ] E2E: cron `daily-summary` idempotent (cần Postgres+Redis đang chạy) — deferred, có thể chạy tay qua seed + queue test
- [ ] E2E: `missing-checkout` đóng session mở — deferred (cần fixtures)

### 4.6 End-of-day
- [x] 8 PR stacked lên `develop`:
  - [#18](https://github.com/thphuc273/smart-attendance/pull/18) `feature/trust-score-schedule` — foundation
  - [#19](https://github.com/thphuc273/smart-attendance/pull/19) `feature/reports-bullmq` — BullMQ + CSV export
  - [#20](https://github.com/thphuc273/smart-attendance/pull/20) `feature/dashboard-manager-anomalies` — anomalies + heatmap read-model
  - [#21](https://github.com/thphuc273/smart-attendance/pull/21) `feature/sprint4-ui` — portal dashboard/sessions/reports/branches/checkin + mobile history
  - [#22](https://github.com/thphuc273/smart-attendance/pull/22) `feature/employees-ui` — portal /employees với device + assignments
  - [#23](https://github.com/thphuc273/smart-attendance/pull/23) `feature/work-schedules` — API module + portal /schedules
  - [#24](https://github.com/thphuc273/smart-attendance/pull/24) `feature/audit-logs-polish` — audit API/UI + monthly summary
  - [#25](https://github.com/thphuc273/smart-attendance/pull/25) `feature/mobile-checkin` — mobile check-in + session detail
- [x] 130/130 unit tests pass · api `tsc --noEmit` clean · `nest build` xanh
- [x] Portal + mobile `tsc --noEmit` clean · `next build` xanh
- [x] PO feature audit: tất cả P0 + P1 đã closed (trừ zero-tap P2 Day 5 scope)

---

## Day 5 — Bonus A: Zero-tap, QR Kiosk, Multi-factor

**Mục tiêu:** Flagship differentiator (Zero-tap) + QR Kiosk mode + Multi-factor check-in (GPS + full WiFi BSSID scan + streak).
**DoD:** (1) Mobile device trusted → tắt app → đi vào geofence giả lập → event zero-tap xuất hiện trên portal. (2) Kiosk portal `/kiosk/:branchId` hiện QR rotate 25s, mobile scan QR → check-in thành công. (3) Tab Check-in hiện streak + GPS accuracy + full BSSID scan.

> **Scope change (2026-04-17):** Face verification bị loại khỏi MVP — chi phí native/model nặng, không cân xứng với 1 ngày sprint. Anti-replay cho QR kiosk dựa vào (a) token 30s, (b) one-time-per-day, (c) GPS geofence, (d) device fingerprint đã trust.

### 5.1 Database (Prisma migration #5 — zero-tap + QR)
- [x] Enum `AttendanceTrigger` (thêm `qr_kiosk`), `ZeroTapRevokeReason`
- [x] `employee_devices`: cột `zero_tap_enabled`, `zero_tap_consent_at`, `zero_tap_revoked_at`, `zero_tap_revoke_reason`, `zero_tap_last_trigger_at`, `attestation_verified_at`, `device_lock_enabled`, `successful_checkin_count`
- [x] Bảng mới `branch_zero_tap_policies` (1:1 với `branches`, default enabled=false)
- [x] `attendance_events`: cột `trigger`, `nonce`, `trigger_at`, `attestation_ok`, `wifi_scan` (jsonb array BSSID xung quanh) + UNIQUE `(device_id, nonce)` + index `(trigger, created_at)`
- [x] Bảng mới `branch_qr_secrets` (branch_id UNIQUE, hmac_secret, rotated_at) — HMAC key rotate thủ công qua admin
- [x] `attendance_sessions`: cột `qr_token_used_at` (chặn one-time-per-day)
- [x] Seed: bật zero-tap policy cho HCM-Q1, `successful_checkin_count=3` cho 1 device test, qr_secret cho 3 branch

### 5.2 API endpoints
**Zero-tap (`api-spec.md` §5B):**
- [x] `POST /attendance/zero-tap/check-in|out` (header `X-Device-Attestation`, body + nonce + trigger_at)
- [x] `GET|PATCH /attendance/zero-tap/settings/me`
- [x] `GET|PUT /branches/:id/zero-tap-policy`
- [x] `POST /employees/:id/devices/:deviceId/revoke-zero-tap`

**QR Kiosk (`api-spec.md` §5D):**
- [x] `GET /kiosk/branches/:id/qr-token` — kiosk auth (mã kiosk riêng), trả `{ token, exp, nonce, next_rotate_at }` HMAC-SHA256 valid 30s
- [x] `POST /attendance/qr-check-in` — body `{ token, latitude, longitude, device_fingerprint }`, verify HMAC + geofence + trusted device + one-time-per-day (`qr_token_used_at`)

**Multi-factor enhancements:**
- [x] `POST /attendance/check-in` nhận thêm `wifi_scan: Array<{ssid, bssid, rssi}>`; backend match **bất kỳ** BSSID nào trong whitelist → pass; WiFi **ưu tiên trước GPS** khi cả 2 có
- [x] `GET /attendance/me/streak` → `{ current, best, on_time_rate_30d, heatmap: Array<{date, status}> }`

- [x] Rate limit: zero-tap 3/phút/device; qr-check-in 5/phút/device; full sweep admin 60/phút

### 5.3 Logic
- [x] `libs/shared/utils/zero-tap-guard.ts`: pure function 5 điều kiện AND (consent, trusted, window, cooldown, quota)
- [x] `libs/shared/utils/qr-token.ts`: pure sign/verify HMAC-SHA256 với timestamp bucket 30s
- [x] `libs/shared/utils/streak.ts`: tính streak từ array daily summaries
- [x] Attestation verify stub (Play Integrity / App Attest) — mock dev, real prod
- [x] Auto-revoke zero-tap device 7 ngày khi `mock_location` detected

### 5.4 UI
- [x] **Mobile (Expo):**
  - [x] Tab **Check-in** redesign 1 viewport: streak card (ngày liên tiếp + best + mini heatmap 30 ô) · GPS lat/lng ± accuracy · **full BSSID scan** (react-native-wifi-reborn) highlight matched · nút Check-in / Check-out / **Quét QR**
  - [x] QR scanner screen (expo-camera BarCodeScanner) → verify → gọi `/attendance/qr-check-in`
  - [x] Settings → toggle Zero-tap + eligibility checks
  - [ ] Background: `TaskManager.defineTask('ZERO_TAP_GEOFENCE')` + `expo-location.startGeofencingAsync` + WiFi listener
  - [ ] `expo-notifications` local push sau zero-tap success
- [x] **Portal:**
  - [x] Route `/kiosk/:branchId` fullscreen (no-chrome layout) — QR image + countdown ring 25s + auto-refresh + branch name/logo
  - [x] Trang Branch detail → tab "Zero-tap Policy" + tab "Kiosk QR secret" (rotate button)
  - [x] Heatmap check-in theo giờ (đã có) — bỏ cột face similarity

### 5.5 Test
- [x] Unit: `zero-tap-guard` 5 điều kiện (15 test)
- [x] Unit: `qr-token` sign/verify + expiry + tampered signature (8 test)
- [x] Unit: `streak` (current/best/broken/heatmap — 8 test)
- [x] E2E: zero-tap nonce trùng → 409 REPLAY; revoke consent → 403; mock_location → auto revoke
- [x] E2E: QR token expired → 422 QR_EXPIRED; QR đã dùng hôm nay → 409 QR_ALREADY_USED

### 5.6 End-of-day
- [x] 3 PR stacked: `feature/day5-zero-tap`, `feature/day5-qr-kiosk`, `feature/day5-multifactor-ui`
- [x] `PROMPT_LOG.md` Session #007: prompt zero-tap-guard, prompt QR HMAC, prompt streak algorithm

---

## Day 6 — Bonus B: AI Insights, Chat HR, Live SSE, Mobile 5-tab, Release

**Mục tiêu:** Gemini AI layer (Dashboard Insights + Chat HR Assistant scope employee) + Live SSE check-in feed + Smart Geofence Notification + Mobile 5-tab shell đầy đủ + release candidate.
**DoD:** (1) `/dashboard` hiển thị AI Insights tuần 3 mục (tích cực / cần chú ý / đề xuất). (2) Admin mở dashboard thấy check-in mới xuất hiện live không refresh. (3) Mobile có đủ 5 tab (Check-in · History · Lịch · Chat AI · Profile), chat AI stream trả lời câu hỏi "Tháng này tôi trễ bao nhiêu lần?". (4) Geofence notification bật → đi vào vùng → push "Bạn đang gần chi nhánh X".

### 6.1 Database (Prisma migration #6 — AI + chat)
- [ ] Bảng mới `ai_chat_messages` (id, employee_id, role `user|assistant|system`, content, tokens_in, tokens_out, created_at) — index `(employee_id, created_at)`
- [ ] Bảng mới `ai_insights_cache` (id, scope `admin|branch`, scope_id, week_start, payload jsonb, generated_at, expires_at) — UNIQUE `(scope, scope_id, week_start)`
- [ ] Không cần migration lớn; chủ yếu 2 bảng phụ

### 6.2 API endpoints
**AI (`api-spec.md` §5E):**
- [ ] `GET /ai/insights/weekly?branch_id?&week_start?` — admin xem toàn hệ thống, manager scope branch; đọc cache nếu còn hạn 1h; nếu miss → gọi Gemini (`gemini-1.5-flash`) với system prompt có số liệu aggregate → parse 3 mục `{ positives[], concerns[], recommendations[] }` + lưu cache
- [ ] `POST /ai/chat` — streaming SSE; body `{ message, conversation_id? }`; server build context từ dữ liệu scope của user (sessions 30 ngày, schedule, streak); employee chỉ thấy data của mình; trả chunks `data: {delta}` + final `data: [DONE]`
- [ ] `GET /ai/chat/history?limit=50`

**Live feed (`api-spec.md` §7.5):**
- [ ] `GET /dashboard/live` SSE endpoint — publish qua Redis pub/sub channel `attendance:live` từ `AttendanceService.checkIn/out` success; event payload `{ event_id, employee_code, full_name, branch_name, status, trust_score, created_at }`; admin thấy all, manager scope branch

**Geofence notification (tách khỏi zero-tap):**
- [ ] (Không cần endpoint mới) — mobile-only feature, dùng `expo-location.startGeofencingAsync` + debounce 30 phút lưu AsyncStorage `last_notified_at[branch_id]`

### 6.3 Logic
- [ ] `libs/api/ai/` module: `GeminiClient` (wrap `@google/generative-ai`), `InsightPromptBuilder`, `ChatContextBuilder`, `AIGuard` (enforce scope employee/manager/admin)
- [ ] Rate limit AI: `/ai/chat` 20/giờ/user, `/ai/insights/weekly` 10/giờ/user
- [ ] Redis pub/sub publisher tại `AttendanceService` sau transaction commit
- [ ] SSE controller dùng `Observable` RxJS, heartbeat 15s, đóng kết nối khi client disconnect
- [ ] Env: `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-1.5-flash`, `AI_CACHE_TTL=3600`

### 6.4 UI
- [ ] **Portal — Dashboard (`/dashboard`):**
  - [ ] Panel "AI Insights tuần" (3 cột: Điểm tích cực / Cần chú ý / Đề xuất) — skeleton loader + refresh button
  - [ ] Charts thêm: line "Chấm công theo ngày" (7 ngày), bar "Theo chi nhánh" top 10, pie "Trạng thái hôm nay" (on_time/late/early_leave) — Recharts
  - [ ] Component **LiveFeed** ở sidebar phải: EventSource `/dashboard/live`, append top 20, fade-in animation
- [ ] **Mobile (Expo) — 5-tab shell:**
  - [ ] `app/(tabs)/_layout.tsx` với 5 tab: Check-in · History · **Lịch** · **Chat AI** · **Profile** (icon từ `@expo/vector-icons`)
  - [ ] Tab **History**: cursor-based infinite scroll (FlashList + `onEndReached`), mỗi item hiện time/branch/status/trust score
  - [ ] Tab **Lịch**: `react-native-calendars` — dot xanh/đỏ từ daily summaries + card tổng hợp tháng (đã có monthly summary API)
  - [ ] Tab **Chat AI**: màn hình chat (Gifted Chat hoặc custom) — stream SSE bằng `fetch` + reader; history load từ `/ai/chat/history`
  - [ ] Tab **Profile**: user info + toggle zero-tap + toggle "Nhắc check-in khi tới chi nhánh" + logout
  - [ ] Background task `GEOFENCE_NOTIFY` — register các branch có assignment, enter → check `last_notified_at[branch_id]` (debounce 30'), `expo-notifications.scheduleNotificationAsync` "Bạn đang gần HCM-Q1, nhớ check-in nhé"

### 6.5 Test
- [ ] Unit: `InsightPromptBuilder` (scope filter, số liệu aggregate — 5 test)
- [ ] Unit: `ChatContextBuilder` employee scope isolation (3 test: employee không thấy data user khác)
- [ ] Unit: `AIGuard` reject employee query về user khác → 403 (2 test)
- [ ] E2E: `/ai/chat` streaming end-to-end với mock Gemini (nock)
- [ ] E2E: SSE `/dashboard/live` nhận event sau `POST /attendance/check-in`
- [ ] Mobile smoke: mở từng tab không crash, Chat AI gửi message nhận reply

### 6.6 Release & Demo
- [ ] README cập nhật: section **AI Insights**, **Chat HR Assistant**, **QR Kiosk**, **Scale strategy**, **Demo script**
- [ ] `.env.example` thêm `GEMINI_API_KEY`
- [ ] Smoke test EAS dev build Android
- [ ] Tag `v0.3.0-bonus`, tạo `release/v0.3.0`, merge về `main`
- [ ] Branch protection `main`: require PR + 1 review + CI pass
- [ ] Record demo video 8–12 phút: login 3 role → manual check-in (multi-factor) → QR kiosk → zero-tap → dashboard AI insights → live SSE → chat AI → export CSV
- [ ] Nộp bài: GitHub repo + demo video + `PROMPT_LOG.md` (tổng kết toàn tuần: best prompts + bad prompts + rút kinh nghiệm)

### 6.7 End-of-day
- [ ] 2 PR stacked: `feature/day6-ai-gemini`, `feature/day6-sse-mobile-tabs`
- [ ] `PROMPT_LOG.md` Session #008: prompt system Gemini Insights, prompt chat scope guard, prompt SSE RxJS — **tổng kết** 6 ngày
- [ ] Cập nhật `docs/spec.md`, `docs/erd.md`, `docs/api-spec.md` nếu lệch so với implement thực tế

---

## Cross-cutting — Daily ritual (mỗi ngày cuối)

- [ ] `npm run lint` + `npm run test` xanh trước khi merge
- [ ] Squash commit theo Conventional Commits (`feat(scope): ...`)
- [ ] PR body: mô tả gì thay đổi + screenshot UI + test plan
- [ ] Cập nhật `PROMPT_LOG.md` với **3 mục tối thiểu**: (1) prompt đáng học, (2) prompt phải sửa lại, (3) quyết định thiết kế phát sinh
- [ ] Branch protection: `develop` không force-push

---

## Risk register

| Rủi ro | Ngày | Mitigation |
|---|---|---|
| iOS NEHotspot entitlement phải xin Apple Dev | Day 2 | Chuẩn bị fallback GPS-only, ghi rõ trong demo |
| Expo Go không chạy native WiFi/attestation | Day 2 | EAS Build dev client từ Day 2 |
| Seed data 7 ngày phức tạp | Day 3 | Viết seed factory-style (faker) trước, data mix tự động |
| BullMQ cron timing trùng | Day 4 | Khoá Redis SETNX, idempotent upsert |
| Play Integrity / App Attest config lâu | Day 5 | Stub verify cho dev, doc rõ production needs |
| Zero-tap test khó trên simulator | Day 5 | Mock geofence event bằng endpoint `POST /dev/zero-tap/simulate` (env=dev) |
| Gemini rate limit / quota | Day 6 | Cache `ai_insights_cache` TTL 1h, rate limit `/ai/chat` 20/giờ/user, fallback message khi quota out |
| SSE connection limit trên free-tier host | Day 6 | Heartbeat 15s, auto-reconnect client; document limit trong README |
| QR kiosk bị chụp màn hình replay | Day 5 | Token valid 30s + one-time-per-day + GPS geofence + device fingerprint trust |

---

## Mapping sang tiêu chí chấm (ASSIGNMENT.md §4)

| Tiêu chí | Tỷ trọng | Ngày chính | Evidence |
|---|---|---|---|
| Tính năng & UX | 25% | Day 2-3-5-6 | Mobile check-in multi-factor, 5-tab shell, portal dashboard, QR kiosk, chat AI |
| Kiến trúc & scale | 20% | Day 1-3-4-6 | Multi-branch schema, index, Redis cache, BullMQ, SSE pub/sub, README scale section |
| Git Flow & Docker | 15% | Day 1 (setup), hàng ngày | Branch history, PR reviews, Conventional Commits, `docker compose up` 1 lệnh |
| AI IDE & Prompt Log | 15% | Hàng ngày | `PROMPT_LOG.md` 6–8 session + `CLAUDE.md` |
| Sáng tạo | 25% | Day 5-6 | Zero-tap, QR Kiosk (TOTP HMAC), Trust Score + Anomaly Dashboard, **Gemini AI Insights + Chat HR Assistant**, SSE live feed |
