<p align="center">
  <img src="finos-smart-attendance.png" alt="FinOS Smart Attendance" width="420" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/-TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/-Node.js%2020%2F22-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/-NestJS%2010-E0234E?logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/-Next.js%2015-000000?logo=next.js&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/-React%2019-20232A?logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/-Expo%20SDK%2054-000020?logo=expo&logoColor=white" alt="Expo" />
  <img src="https://img.shields.io/badge/-React%20Native%200.81-20232A?logo=react&logoColor=61DAFB" alt="React Native" />
  <img src="https://img.shields.io/badge/-Prisma%206-2D3748?logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/-PostgreSQL%2016-316192?logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/-Redis%207-DC382D?logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/-BullMQ-EC1C24?logo=redis&logoColor=white" alt="BullMQ" />
  <img src="https://img.shields.io/badge/-TailwindCSS-06B6D4?logo=tailwindcss&logoColor=white" alt="TailwindCSS" />
  <img src="https://img.shields.io/badge/-TanStack%20Query-FF4154?logo=reactquery&logoColor=white" alt="TanStack Query" />
  <img src="https://img.shields.io/badge/-Zod-3E67B1?logo=zod&logoColor=white" alt="Zod" />
  <img src="https://img.shields.io/badge/-Gemini%202.5%20Flash-4285F4?logo=google&logoColor=white" alt="Gemini" />
  <img src="https://img.shields.io/badge/-Docker%20Compose-2496ED?logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/-pnpm%20workspaces-F69220?logo=pnpm&logoColor=white" alt="pnpm" />
  <img src="https://img.shields.io/badge/-Jest-C21325?logo=jest&logoColor=white" alt="Jest" />
</p>

---

## 1. Tổng quan sản phẩm

**Smart Attendance** là hệ thống chấm công thông minh được thiết kế cho doanh nghiệp quy mô **100 chi nhánh × 5.000 nhân viên**. Sản phẩm thay thế cách chấm công thủ công/máy vân tay bằng một pipeline **GPS + WiFi + Device attestation** kết hợp **Trust Score** và **Anomaly Detection** để vừa nhanh cho nhân viên vừa an toàn cho doanh nghiệp.

- **Đối tượng sử dụng**
  - **Nhân viên** — check-in/out chỉ bằng việc bước vào vùng chi nhánh (zero-tap) hoặc quét QR kiosk khi offline.
  - **Manager chi nhánh** — theo dõi realtime feed, duyệt/chỉnh sửa, xem báo cáo chi nhánh.
  - **Admin** — cấu hình branch/wifi/geofence, quản lý nhân sự, xem dashboard toàn hệ thống, AI insights.

- **Giá trị cốt lõi**
  - ⚡ **Zero-tap check-in** — chấm công tự động khi nhân viên vào vùng chi nhánh (GPS geofence + WiFi BSSID + device attestation).
  - 🛡️ **Anti-fraud đa tầng** — phát hiện mock location, VPN, thiết bị lạ, đi kèm Trust Score 0–100 và audit log.
  - 🤖 **AI HR Assistant (Gemini)** — weekly insights + chat với function calling (9 tools theo scope admin/manager/employee).
  - 📊 **Realtime dashboard** — live SSE feed, leaderboard, trend 7/30 ngày, anomaly board.
  - 📱 **Multi-platform** — NestJS backend + Next.js portal + Expo React Native mobile, chia sẻ contract qua OpenAPI.

---

## 2. Tính năng — Admin / Manager Portal (Next.js)

| Khu vực | Chức năng chính |
|---|---|
| **Dashboard** (`/dashboard`) | Overview toàn hệ thống (admin) hoặc theo chi nhánh (manager): số check-in hôm nay, on-time/late/absent, leaderboard, trend 7 ngày, live feed (SSE). |
| **Employees** (`/employees`) | CRUD nhân viên, gán chi nhánh, xem device & zero-tap status, revoke device, assign work schedule. |
| **Branches** (`/branches`) | Quản lý chi nhánh + WiFi whitelist (SSID/BSSID priority) + Geofence (center lat/lng + radius) + Zero-tap policy. |
| **Sessions** (`/sessions`) | Xem attendance_sessions theo ngày/chi nhánh, manager override với audit trail, drill-down sang events. |
| **Schedules** (`/schedules`) | Work schedule (giờ vào/ra, grace minutes, OT threshold, workdays), gán cho nhân viên. |
| **Reports** (`/reports`) | Daily summary, branch report, CSV export async qua BullMQ queue, download khi job completed. |
| **Kiosk** (`/kiosk`) | Hiển thị QR token cho branch không phủ WiFi (token rotate, chống replay). |
| **Checkin** (`/checkin`) | Manual check-in cho desktop dev/demo. |
| **Chat HR** (`/chat`) | Gemini-powered assistant với function calling (9 tools), scope guard 2 tầng. |
| **Audit Logs** (`/audit-logs`) | Truy vết mọi thao tác override/revoke của admin/manager. |

**Phân quyền (RBAC + scope-based):**

| Role | Scope | Quyền điển hình |
|---|---|---|
| `admin` | Toàn hệ thống | CRUD tất cả, override mọi branch, xem dashboard hệ thống, cấu hình rule |
| `manager` | `managed_branches[]` | Xem/chỉnh sessions của branch mình, duyệt override, báo cáo chi nhánh |
| `employee` | Cá nhân | Xem lịch sử, streak, ca làm của bản thân |

Mọi endpoint đi qua `JwtAuthGuard` + `RolesGuard` + **branch-scope check** ở tầng service. Admin/manager override bắt buộc ghi `audit_logs`.

---

## 3. Tính năng — Mobile App (Expo + React Native)

Ứng dụng nhân viên sử dụng **expo-router** file-based routing, tab navigator với 5 tabs chính:

| Tab / Route | Mô tả |
|---|---|
| `index` (Home) | Check-in/out button, branch gần nhất, streak hiện tại, today session status. |
| `calendar` | Lịch tháng, trạng thái từng ngày (on-time / late / absent / leave / WFH). |
| `history` | Danh sách sessions với filter, pull-to-refresh. |
| `chat` | HR Assistant streaming SSE từ Gemini. |
| `profile` | Thông tin user, toggle Zero-tap, toggle Geofence Notify, notifications, logout. |

**Các flow quan trọng:**

- **Login** (`/login`) — email + password → JWT access (15m) + refresh (7d) lưu qua `expo-secure-store`.
- **Manual check-in** (`/checkin`) — Foreground location + WiFi scan → gọi `POST /attendance/check-in` → server validate geofence/WiFi/device → trả session với trust score.
- **QR Kiosk** (`/scanner`) — `expo-camera` scan QR token từ portal → `POST /attendance/qr-check-in`.
- **Zero-tap** — `expo-task-manager` + `expo-location.startGeofencingAsync()` đăng ký geofence các branch, khi user enter vùng → background task tự gọi `POST /attendance/zero-tap/check-in` với nonce + device attestation → local notification thông báo thành công. Yêu cầu: device trusted, ≥ N lần manual check-in trước đó, zero-tap enabled, trong giờ policy.
- **Geofence Notify** (`/notifications`) — nhắc chấm công (không tự chấm) khi vào vùng, debounce 30 phút. Requires Expo Dev Client (không hỗ trợ Expo Go).
- **Session detail** (`/session/[id]`) — events timeline, trust score breakdown.

**Native requirements (đã cấu hình trong `apps/mobile/app.json`):**
- iOS: `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSCameraUsageDescription`, `UIBackgroundModes: [location, fetch]`.
- Android: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `ACCESS_WIFI_STATE`, `NEARBY_WIFI_DEVICES`, `FOREGROUND_SERVICE`, `CAMERA`.

> Background location & remote push **không chạy trên Expo Go** (SDK 53+); phải build dev client qua `make mobile-prebuild` + `make mobile-ios` / `make mobile-android`.

---

## 4. Kiến trúc kỹ thuật

### 4.1 High-level

```
┌─────────────────────┐        ┌────────────────────────┐
│  Mobile (Expo RN)   │        │  Portal (Next.js 15)   │
│  expo-router, ky    │        │  App Router, TanStack  │
│  expo-secure-store  │        │  Query, Recharts       │
└──────────┬──────────┘        └───────────┬────────────┘
           │ HTTPS + JWT (Bearer)          │ HTTPS + JWT
           └───────────────┬───────────────┘
                           ▼
                ┌─────────────────────┐
                │   NestJS 10 API     │
                │   /api/v1/*         │
                │   Swagger /api/docs │
                └──┬──────┬───────┬───┘
                   │      │       │
                   ▼      ▼       ▼
            ┌────────┐ ┌──────┐ ┌─────────┐
            │Postgres│ │Redis │ │ Gemini  │
            │  16    │ │ 7    │ │2.5-flash│
            │(Prisma)│ │BullMQ│ │function │
            └────────┘ └──────┘ │ calling │
                                └─────────┘
```

### 4.2 Monorepo layout

```
smart-attendance/
├── apps/
│   ├── api/        # NestJS 10 + Prisma 6 + BullMQ
│   ├── portal/     # Next.js 15 App Router + Tailwind + React 19
│   └── mobile/     # Expo SDK 54 + React Native 0.81 + expo-router 6
├── docs/           # spec.md, api-spec.md, erd.md, sprint-plan.md
├── scripts/        # reset-db.sh + helpers
├── docker-compose.yml
├── Makefile        # make help cho 25+ targets
└── PROMPT_LOG.md
```

### 4.3 API module breakdown (NestJS)

| Module | Trách nhiệm |
|---|---|
| `auth` | Login, refresh token, `/me`, argon2 password, JWT access 15m + refresh 7d |
| `branches` | Branch CRUD, wifi_configs, geofences, zero-tap policy |
| `employees` | Employee CRUD, device list, zero-tap toggle, assignments |
| `attendance` | Manual check-in/out, sessions, events, me/streak, me/geofences |
| `zero-tap` | Background check-in/out, nonce validation, device attestation, auto-revoke |
| `kiosk` | QR token rotation, `/attendance/qr-check-in` |
| `reports` | Daily summary, branch report, CSV export async (BullMQ) |
| `dashboard` | Admin/manager overview, trend, anomalies, leaderboard, live SSE |
| `ai` | Weekly insights (cached 1h), Chat SSE với 9 function tools, scope guard 2-tier |
| `live` | `LiveBusService` in-memory pub/sub + SSE endpoint `/dashboard/live` |
| `notifications` | User-facing notification inbox |
| `audit-logs` | Immutable log của override/revoke |
| `work-schedules` | Schedule CRUD + assignment |
| `queue` | BullMQ setup, missing-checkout processor, export processor |
| `prisma` | PrismaService wrapper + transaction helper |

---

## 5. Technical deep-dive

### 5.1 Validation 2 lớp

- **DTO layer** — `class-validator` + `class-transformer` cho format/type/required.
- **Service layer** — business rule (geofence distance, schedule grace, role/branch scope, zero-tap guard).

### 5.2 Trust Score (0–100)

Pure function `trust-score.ts`, inputs: GPS accuracy, WiFi match, device trust, history consistency. Output: `{ score, flags[], method }`. Được tính lại mỗi check-in/out và lưu vào `attendance_events`.

### 5.3 Zero-tap (flagship)

Điều kiện cần đủ (AND):
1. `device.is_trusted = true`
2. `device.zero_tap_enabled = true`
3. `user.manual_checkins >= min_manual_checkins_to_enable`
4. Attestation token hợp lệ (Play Integrity / App Attest)
5. Request trong `zero_tap_window` của branch policy
6. Cooldown (mặc định 4h) từ lần zero-tap trước
7. `nonce` unique trong window 90s (chống replay)

Trust score zero-tap trừ 5 điểm base. Mock location bị detect → **auto revoke device 7 ngày** + audit log. Toàn bộ pipeline cô lập tại `zero-tap.service.ts` + pure `zero-tap-guard.ts`.

### 5.4 AI Chat — Gemini Function Calling

- **9 tools** nhóm theo scope: self (employee), branch (manager), admin.
- **Scope guard 2 tầng**: tier 1 system prompt + tier 2 runtime re-check trong `ToolExecutor` → trả `BRANCH_OUT_OF_SCOPE` / `INSUFFICIENT_PERMISSION`.
- Vòng lặp generate → execute → respond tối đa **6 iterations**, sau đó fakeStream text cuối cùng qua SSE.
- Fallback **STUB mode** khi `GEMINI_API_KEY` rỗng (canned replies để dev offline).

### 5.5 Realtime & Queue

- **SSE** `/dashboard/live` qua `LiveBusService` (EventEmitter) — publish mỗi check-in thành công.
- **BullMQ jobs**: `missing-checkout` (cron đóng session quên check-out), `report-export` (CSV async).
- Rate limit `@nestjs/throttler`: login 5/min, check-in 10/min, AI chat 20/h, AI insights 60/h (cache DB hấp thụ spike).

### 5.6 Caching

- **Redis** cache branch config (geofences + wifi) TTL 5'.
- **DB-backed** `ai_insight_cache` TTL 1h (scope: admin / branch, per week).
- **Read model** `daily_attendance_summaries` cho dashboard (không join raw events).

### 5.7 API contract

- REST JSON, base path `/api/v1`.
- Response shape wrap qua `ResponseTransformInterceptor`:
  ```json
  { "data": <T | T[]>, "meta": { "pagination": { ... } } }
  { "error": { "code": "...", "message": "...", "details": { } } }
  ```
- Swagger UI: `http://localhost:3000/api/docs`.
- Xem chi tiết tại [`docs/api-spec.md`](docs/api-spec.md).

---

## 6. Quick start

### 6.1 Prerequisites

| Tool | Version |
|---|---|
| Node.js | **20.x hoặc 22.x LTS** (Node ≥ 25 phá ESM resolver của `@expo/metro`) |
| pnpm | **10.33** (`corepack enable` hoặc `npm i -g pnpm@10.33`) |
| Docker | Desktop + Compose V2 |
| Mobile | Xcode 15+ (iOS) hoặc Android Studio Giraffe+ (Android); Expo dev client |

### 6.2 Cài đặt

```bash
git clone <repo-url> smart-attendance
cd smart-attendance
cp .env.example .env           # điền GEMINI_API_KEY nếu muốn AI thật
make install                   # pnpm install toàn workspace
```

### 6.3 Chạy hạ tầng (Postgres + Redis)

```bash
make docker-up                 # postgres:16 + redis:7 (+ api/portal nếu dùng compose full)
make db-migrate                # prisma migrate dev
make db-seed                   # seed roles, branches, admin/manager/30 employees
```

### 6.4 Chạy dev servers

| Service | Lệnh | Mô tả |
|---|---|---|
| API | `make dev-api` | NestJS watch mode, port 3000 |
| Portal | `make dev-portal` | Next.js dev, port 3100 |
| Mobile | `make dev-mobile` | Expo dev server (cần dev client) |
| API + Portal song song | `make dev` | — |

Build native mobile (yêu cầu Xcode/Android Studio):

```bash
make mobile-prebuild   # regen ios/ + android/ từ app.json
make mobile-ios        # chạy trên iOS simulator
make mobile-android    # chạy trên Android emulator
```

### 6.5 Kiểm thử & chất lượng

```bash
make typecheck         # tsc --noEmit cho cả 3 workspaces
make test              # jest (api) + next lint (portal)
make test-e2e          # supertest end-to-end (cần docker-up)
make verify            # typecheck + lint + test (chạy trước khi push)
```

Chạy `make help` để xem toàn bộ targets.

---

## 7. Default credentials (seed)

Sau khi `make db-seed` thành công, có sẵn các tài khoản:

| Role | Email | Password | Ghi chú |
|---|---|---|---|
| Admin | `admin@demo.com` | `Admin@123` | Full quyền hệ thống |
| Manager | `manager.hcm@demo.com` | `Manager@123` | Quản lý chi nhánh **HCM-Q1** |
| Employee | `employee001@demo.com` … `employee030@demo.com` | `Employee@123` | 30 nhân viên (10/chi nhánh × 3 chi nhánh HCM/HN/DN) |

> Đổi password ngay sau khi seed trên môi trường không-dev. Các secret JWT mặc định trong `.env.example` chỉ dùng để chạy thử.

---

## 8. Service URLs

| Service | URL | Notes |
|---|---|---|
| API (REST) | `http://localhost:3000/api/v1` | Base path cho mọi endpoint |
| API Swagger | `http://localhost:3000/api/docs` | OpenAPI UI |
| API health | `http://localhost:3000/api/v1/health` | Readiness probe |
| Live feed (SSE) | `http://localhost:3000/api/v1/dashboard/live` | Requires JWT |
| Portal | `http://localhost:3100` | Next.js admin/manager |
| Portal login | `http://localhost:3100/login` | — |
| Mobile dev | `http://localhost:8081` | Expo Metro bundler |
| Postgres | `postgresql://sa_user:***@localhost:5432/smart_attendance` | Local dev |
| Redis | `redis://localhost:6379` | Cache + BullMQ |
| `EXPO_PUBLIC_API_BASE_URL` | `http://<lan-ip>:3000/api/v1` | Mobile gọi API phải dùng LAN IP của máy host, không `localhost` |

---

## 9. Cấu trúc tài liệu

| File | Nội dung |
|---|---|
| [`docs/spec.md`](docs/spec.md) | Rule nghiệp vụ: check-in, zero-tap, trust score, anti-fraud 4 lớp |
| [`docs/api-spec.md`](docs/api-spec.md) | API contract chi tiết + error codes + rate limit |
| [`docs/erd.md`](docs/erd.md) | Schema Prisma + index DB |
| [`docs/sprint-plan.md`](docs/sprint-plan.md) | Checklist 6-day AI-assisted build |
| [`docs/CLAUDE.md`](docs/CLAUDE.md) | Context cho AI IDE (Claude Code / Cursor / Copilot) |
| [`PROMPT_LOG.md`](PROMPT_LOG.md) | Nhật ký prompt + output + chỉnh sửa |

---

## 10. License

Internal project — FinOS Asia. All rights reserved.
