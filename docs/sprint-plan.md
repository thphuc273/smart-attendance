# SMART ATTENDANCE — 5-DAY SPRINT PLAN

> **Lead:** Felix (Backend + AI Engineer) · **Role:** PM + Architect · **Tuần:** 2026-04-16 → 2026-04-22
> **Stack chốt (docs v0.2):** NestJS + Prisma + PostgreSQL 16 + Redis/BullMQ · Mobile = **Expo SDK 51 + React Native** · Portal = **Next.js 15 + shadcn/ui** · Nx monorepo · Docker Compose.
> **Nguồn chân lý:** `docs/spec.md` (§11 MVP), `docs/erd.md`, `docs/api-spec.md`, `docs/CLAUDE.md`.
>
> **Nguyên tắc sprint:** Mỗi ngày kết thúc bằng `docker compose up` chạy được + ghi `PROMPT_LOG.md`. Không merge feature sang `develop` nếu chưa có test + review 100% code AI sinh ra.

---

## Day 1 — Foundation, Auth, Branch CRUD

**Mục tiêu:** Hạ tầng chạy được, login 3 role, quản lý chi nhánh + WiFi/Geofence config.
**DoD:** `docker compose up` → login `admin@demo.com` → tạo branch + 1 wifi + 1 geofence qua API.

### 1.1 Infra & monorepo
- [ ] Khởi tạo Nx workspace `smart-attendance` (TypeScript preset)
- [ ] Tạo `apps/api` (NestJS), `apps/portal` (Next.js 15), `apps/mobile` (Expo)
- [ ] Tạo `libs/shared/types`, `libs/shared/constants`, `libs/shared/utils`, `libs/api/*`
- [ ] `.env.example` đầy đủ (DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, PORT)
- [ ] `docker-compose.yml`: `postgres:16`, `redis:7`, `api` (multi-stage Dockerfile), volumes persist
- [ ] `Dockerfile` multi-stage cho `apps/api` (deps → build → runtime)
- [ ] ESLint + Prettier + Husky pre-commit + Conventional Commits check (commitlint)
- [ ] Git flow init: `main`, `develop`, branch `feature/day1-foundation`

### 1.2 Database (Prisma migration #1)
**Bảng cần tạo (tham chiếu `docs/erd.md` §3):**
- [ ] `users`, `roles`, `user_roles`
- [ ] `branches`, `departments`
- [ ] `branch_wifi_configs`, `branch_geofences`
- [ ] `work_schedules` (tạo bảng, seed 1 ca chuẩn 08–17)
- [ ] `audit_logs`
- [ ] Seed: 3 roles (`admin`, `manager`, `employee`), 1 admin `admin@demo.com / Admin@123`

### 1.3 API endpoints (`docs/api-spec.md` §2, §3)
- [ ] `POST /auth/login` — JWT access + refresh, rate limit 5/phút/IP
- [ ] `POST /auth/refresh`
- [ ] `POST /auth/logout`
- [ ] `GET /auth/me`
- [ ] `JwtAuthGuard` + `RolesGuard` + `BranchScopeGuard` + `@CurrentUser()` decorator
- [ ] `ResponseTransformInterceptor` (chuẩn hoá `{ data, meta }`)
- [ ] Global exception filter (format lỗi `{ error: { code, message, details } }`)
- [ ] `GET|POST|PATCH|DELETE /branches` (pagination, filter `status`, `search`)
- [ ] `GET|POST|DELETE /branches/:id/wifi-configs`
- [ ] `GET|POST /branches/:id/geofences`
- [ ] Swagger tại `/api/docs`

### 1.4 UI
- [ ] **Portal (Next.js):** login page + layout, branch list + form tạo/sửa branch + sub-form WiFi/Geofence (shadcn Form + zod)
- [ ] **Mobile (Expo):** khởi tạo expo-router, splash + login screen (react-hook-form + zod), lưu token vào `expo-secure-store`
- [ ] API client wrapper ở `libs/shared/api-client` (dùng chung mobile + portal)

### 1.5 Test
- [ ] Unit: `AuthService.login` (happy + wrong password), `BranchService.create` (duplicate code 409)
- [ ] E2E: `POST /auth/login` → `GET /auth/me` với token trả về

### 1.6 End-of-day
- [ ] PR `feature/day1-foundation` → `develop` (1 PR, self-review, squash merge)
- [ ] Ghi `PROMPT_LOG.md` Session #003: prompt sinh skeleton module, prompt sinh migration đầu, prompt sinh BranchScopeGuard — kèm diff review

---

## Day 2 — Employees, Devices, Core Check-in/Check-out

**Mục tiêu:** Nhân viên login được, check-in qua GPS HOẶC WiFi, log `attendance_events`.
**DoD:** Từ mobile: login `employee001@demo.com` → bấm check-in → tạo session + event status `success`.

### 2.1 Database (Prisma migration #2)
- [ ] `employees`, `employee_branch_assignments`
- [ ] `employee_devices` (MVP: chưa cột zero-tap, sẽ thêm Day 5)
- [ ] `attendance_sessions` (UNIQUE `(employee_id, work_date)`)
- [ ] `attendance_events` (index theo `session_id, created_at` và `employee_id, created_at`)
- [ ] `work_schedule_assignments`
- [ ] Seed: 30 employees (10/branch), password `Employee@123`, gán department + primary_branch

### 2.2 API endpoints (`docs/api-spec.md` §4, §5)
- [ ] `GET|POST|PATCH /employees` (admin all, manager own-branches)
- [ ] `POST /employees/:id/assignments` (secondary/temporary)
- [ ] `GET /employees/:id/devices`
- [ ] `PATCH /employees/:id/devices/:deviceId` (toggle `is_trusted`)
- [ ] **`POST /attendance/check-in`** — validation layer 1 (GPS geofence OR BSSID whitelist), layer 2 (risk flags), trust_score MVP (không full rule, Day 4 hoàn thiện)
- [ ] **`POST /attendance/check-out`** — update `check_out_at`, `worked_minutes`
- [ ] Rate limit `/check-in`, `/check-out`: 10/phút/employee (Redis)
- [ ] `libs/shared/utils/geo.ts` — pure function Haversine + point-in-circle
- [ ] `libs/shared/utils/trust-score.ts` — khung hàm thuần, trả score MVP

### 2.3 Logic nghiệp vụ
- [ ] Tự động auto-register device khi fingerprint lần đầu gặp (is_trusted=false)
- [ ] Idempotent: check-in lần 2 cùng ngày → ignore nếu lần đầu success, update nếu fail
- [ ] Error mapping: `INVALID_LOCATION` (422), `ALREADY_CHECKED_IN` (409), `NOT_ASSIGNED_TO_BRANCH` (422)
- [ ] Mọi failed attempt **vẫn ghi** `attendance_events` với `status=failed`

### 2.4 UI
- [ ] **Mobile (Expo):**
  - [ ] Quyền: `expo-location` foreground + Android `NEARBY_WIFI_DEVICES`, iOS NEHotspot entitlement (config qua `expo-build-properties`)
  - [ ] Màn hình Check-in: hiển thị branch + trạng thái hôm nay + nút Check-in/Check-out to, loading + result toast
  - [ ] Thu thập: GPS (accuracy), SSID/BSSID, device fingerprint (expo-device + expo-crypto)
  - [ ] EAS Build dev client (không dùng Expo Go vì cần native module)
- [ ] **Portal (Next.js):** Trang Employees list + filter theo branch/department + form tạo nhanh

### 2.5 Test
- [ ] Unit: `geo.isInsideGeofence`, `wifi.isBssidWhitelisted`, trust score MVP
- [ ] E2E: check-in hợp lệ → 201, check-in ngoài geofence + sai BSSID → 422, check-in lần 2 → 409
- [ ] E2E: manager không thấy employee branch khác → 403

### 2.6 End-of-day
- [ ] PR `feature/day2-attendance-core` → `develop`
- [ ] `PROMPT_LOG.md` Session #004: prompt cho trust-score pure function, prompt tạo validation service, prompt Expo check-in screen — ghi lại chỉnh sửa

---

## Day 3 — History, Dashboard Admin, Seed đầy đủ, Docker polish

**Mục tiêu:** MVP must-have đóng gói gọn. Demo end-to-end chạy được.
**DoD:** Admin login portal → thấy dashboard thống kê; Employee mobile thấy lịch sử 7 ngày.

### 3.1 Database (Prisma migration #3)
- [ ] `daily_attendance_summaries` (UNIQUE `(employee_id, work_date)`)
- [ ] Seed **7 ngày attendance data**: mix status (on_time/late/absent), trust score cao/thấp, 1 missing_checkout, 1 failed event
- [ ] Hoàn thiện test accounts: `admin@demo.com`, `manager.hcm@demo.com` (gán 1 branch), `employee001@demo.com`

### 3.2 API endpoints
- [ ] `GET /attendance/me?date_from&date_to` (pagination, filter theo month)
- [ ] `GET /attendance/sessions` (manager/admin, filter branch/employee/date/status)
- [ ] `GET /attendance/sessions/:id` (trả session + events list)
- [ ] `PATCH /attendance/sessions/:id` (manager override, **bắt buộc** audit log `before/after`)
- [ ] `GET /dashboard/admin/overview` (total_employees, today stats, top branches, checkin_heatmap)
- [ ] Redis cache: branch config TTL 5', dashboard aggregate TTL 60s

### 3.3 UI
- [ ] **Mobile:** màn hình Lịch sử (list theo ngày, badge status, trust score color)
- [ ] **Mobile:** màn hình Chi tiết session (events list + map marker nếu có GPS)
- [ ] **Portal:** trang Sessions (filter, table server-side pagination, modal chi tiết + nút override cho manager/admin)
- [ ] **Portal:** Admin Dashboard (stat cards + top branches + heatmap dùng Recharts)

### 3.4 Docker & DX
- [ ] `docker compose up` 1 lệnh → api + postgres + redis + portal dev sẵn sàng
- [ ] `scripts/reset-db.sh`: migrate + seed idempotent
- [ ] README root: setup guide, cấu trúc, lệnh chạy, test accounts (cho bài nộp)
- [ ] `.env.example` sync với tất cả dịch vụ

### 3.5 Test
- [ ] Unit: `SessionService.override` tạo audit_log đúng format
- [ ] E2E: golden path — login admin → list sessions → override → audit log xuất hiện trong `GET /audit-logs`
- [ ] Coverage ≥ 60% cho `libs/api/attendance`

### 3.6 End-of-day
- [ ] PR `feature/day3-history-dashboard` → `develop`, tag `v0.1.0-mvp`
- [ ] `PROMPT_LOG.md` Session #005: prompt sinh audit interceptor, prompt dashboard aggregate query SQL — note hiệu suất
- [ ] **Cut-off Must-have** ✅ — MVP mục `11.Must-have` đóng

---

## Day 4 — Should-have: Trust Score full, Cron, Manager, CSV Export

**Mục tiêu:** Chất lượng nghiệp vụ + báo cáo + dashboard manager.
**DoD:** Export CSV tháng 4 cho 1 branch; cron 00:30 chạy tự động tạo summary.

### 4.1 Database (Prisma migration #4)
- [ ] Thêm cột cần thiết (nếu chưa có) cho overtime/late minutes trên `attendance_sessions`
- [ ] Index bổ sung: `attendance_events (status, created_at)` cho anomaly query

### 4.2 Logic nghiệp vụ
- [ ] `trust-score.ts` đủ 10 rule (bảng §5.2 spec): GPS accuracy tier, BSSID/SSID, trusted device, mock_location, impossible_travel, VPN
- [ ] `ScheduleService`: xác định ca hiện tại từ `work_schedule_assignments`
- [ ] Phân loại status: `on_time | late | early_leave | overtime | missing_checkout`
- [ ] BullMQ jobs:
  - [ ] `missing-checkout-close` (cron 23:59)
  - [ ] `daily-summary` (cron 00:30, idempotent upsert)
  - [ ] `report-export` (on-demand)

### 4.3 API endpoints (`docs/api-spec.md` §6, §7)
- [ ] `GET /reports/daily-summary` (filter branch/dept/date)
- [ ] `GET /reports/branch/:id` (aggregate period)
- [ ] `POST /reports/export` → trả `job_id` (202)
- [ ] `GET /reports/export/:jobId` (status + download_url)
- [ ] `GET /reports/export/:jobId/download` (stream CSV)
- [ ] `GET /dashboard/manager/:branchId` (today stats + low_trust_today + week_trend)
- [ ] Rate limit `/reports/export`: 3/phút/user

### 4.4 UI
- [ ] **Portal — Manager Dashboard:** stat cards today, list low-trust sessions (click → modal override), week trend chart
- [ ] **Portal — Reports page:** form filter → gọi export → polling status → download
- [ ] **Mobile:** hiển thị overtime minutes + late warning trên lịch sử

### 4.5 Test
- [ ] Unit: trust-score từng rule (10 case), schedule resolver
- [ ] Unit: CSV formatter đúng format BOM + Vietnamese UTF-8
- [ ] E2E: cron daily-summary idempotent (chạy 2 lần không nhân đôi)
- [ ] E2E: missing-checkout close session còn mở

### 4.6 End-of-day
- [ ] PR `feature/day4-reports-cron` → `develop`
- [ ] `PROMPT_LOG.md` Session #006: prompt full trust-score, prompt BullMQ job scaffold, prompt CSV streaming — ghi điểm chỉnh sửa

---

## Day 5 — Bonus: Zero-tap, Anomaly, Polish, Release

**Mục tiêu:** Flagship differentiator (Zero-tap) + Anomaly Dashboard + release candidate.
**DoD:** Mobile device trusted → tắt app → đi vào geofence giả lập → event zero-tap xuất hiện trên portal; Anomaly dashboard hiển thị branch có late spike.

### 5.1 Database (Prisma migration #5 — zero-tap)
- [ ] Enum `AttendanceTrigger`, `ZeroTapRevokeReason`
- [ ] `employee_devices`: cột `zero_tap_enabled`, `zero_tap_consent_at`, `zero_tap_revoked_at`, `zero_tap_revoke_reason`, `zero_tap_last_trigger_at`, `attestation_verified_at`, `device_lock_enabled`, `successful_checkin_count`
- [ ] Bảng mới `branch_zero_tap_policies` (1:1 với `branches`, default enabled=false)
- [ ] `attendance_events`: cột `trigger`, `nonce`, `trigger_at`, `attestation_ok` + UNIQUE `(device_id, nonce)` + index `(trigger, created_at)`
- [ ] Seed: bật policy cho HCM-Q1, set `successful_checkin_count=3` cho 1 device test

### 5.2 API endpoints (`docs/api-spec.md` §5B, §7)
- [ ] `POST /attendance/zero-tap/check-in` (header `X-Device-Attestation`, body + nonce + trigger_at)
- [ ] `POST /attendance/zero-tap/check-out`
- [ ] `GET /attendance/zero-tap/settings/me`
- [ ] `PATCH /attendance/zero-tap/settings/me`
- [ ] `GET|PUT /branches/:id/zero-tap-policy`
- [ ] `POST /employees/:id/devices/:deviceId/revoke-zero-tap`
- [ ] `GET /dashboard/anomalies` (branches_late_spike + employees_low_trust + untrusted_devices_new_today)
- [ ] Rate limit zero-tap: 3 req/phút/device + cooldown server-side 600s
- [ ] Full rate limit sweep toàn bộ endpoint admin (60/phút/user)

### 5.3 Logic
- [ ] `libs/shared/utils/zero-tap-guard.ts`: pure function kiểm tra 5 điều kiện AND (consent, trusted, window, cooldown, quota)
- [ ] Attestation verify stub: Play Integrity + App Attest (mock trong dev, real endpoint production)
- [ ] Auto-revoke device 7 ngày khi `risk_flags` chứa `mock_location` trong zero-tap event
- [ ] Anomaly detection job (cron 01:00) tính branch late spike vs tuần trước

### 5.4 UI
- [ ] **Mobile (Expo):**
  - [ ] Màn hình Settings → toggle Zero-tap (hiển thị eligibility checks rõ ràng)
  - [ ] Background task: `TaskManager.defineTask('ZERO_TAP_GEOFENCE')`
  - [ ] Đăng ký geofence `Location.startGeofencingAsync` với các branch user có assignment
  - [ ] WiFi listener (native module qua prebuild) gọi background task khi kết nối BSSID whitelist
  - [ ] `expo-notifications` local push sau khi zero-tap thành công ("Đã check-in tự động 08:03…")
- [ ] **Portal:**
  - [ ] Trang Anomaly Dashboard (tabs: branch spikes, employees, new devices)
  - [ ] Trang Branch detail → tab "Zero-tap Policy" (bật/tắt, window, cooldown, audit history)
  - [ ] Heatmap check-in theo giờ (Recharts hour bucket)

### 5.5 Release & Demo
- [ ] Smoke test trên build EAS dev client Android + iOS
- [ ] README cập nhật: section **Zero-tap**, **Scale strategy** (diễn giải §8 spec), **Demo script**
- [ ] Tag `v0.2.0-bonus`, tạo `release/v0.2.0`, merge về `main`
- [ ] Branch protection `main`: require PR + 1 review + CI pass
- [ ] Record demo video 5–10 phút (script sẵn): login 3 role → manual check-in → zero-tap → dashboard → anomaly → export CSV

### 5.6 Test
- [ ] Unit: `zero-tap-guard` tất cả 5 điều kiện (15 test case)
- [ ] E2E: zero-tap endpoint với nonce trùng → 409 REPLAY
- [ ] E2E: revoke consent → request tiếp → 403 NOT_CONSENTED
- [ ] E2E: mock_location trong zero-tap → device auto revoke

### 5.7 End-of-day
- [ ] PR `feature/day5-zero-tap-anomaly` → `develop` → `release/v0.2.0` → `main`
- [ ] `PROMPT_LOG.md` Session #007: prompt zero-tap-guard, prompt background task Expo, prompt anomaly query — **tổng kết** toàn tuần: best prompts + bad prompts + rút kinh nghiệm
- [ ] Cập nhật `docs/spec.md`, `docs/erd.md`, `docs/api-spec.md` nếu lệch so với implement thực tế
- [ ] Nộp bài: GitHub repo + demo video + PROMPT_LOG.md

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

---

## Mapping sang tiêu chí chấm (ASSIGNMENT.md §4)

| Tiêu chí | Tỷ trọng | Ngày chính | Evidence |
|---|---|---|---|
| Tính năng & UX | 25% | Day 2-3-5 | Mobile check-in, portal dashboard, zero-tap flow |
| Kiến trúc & scale | 20% | Day 1-3-4 | Multi-branch schema, index, Redis cache, BullMQ, README scale section |
| Git Flow & Docker | 15% | Day 1 (setup), hàng ngày | Branch history, PR reviews, Conventional Commits, `docker compose up` 1 lệnh |
| AI IDE & Prompt Log | 15% | Hàng ngày | `PROMPT_LOG.md` 5–7 session + `CLAUDE.md` |
| Sáng tạo | 25% | Day 5 | Zero-tap check-in, Trust Score + Anomaly Dashboard |
