# Smart Attendance

Hệ thống chấm công thông minh cho doanh nghiệp **100 chi nhánh × 5.000 nhân viên**.
Check-in/out qua GPS geofencing + WiFi SSID/BSSID, **Trust Score**, **Anomaly Dashboard**, và tính năng flagship: **Zero-tap check-in** (nhân viên không mở app, không chạm — hệ thống tự check-in khi vào vùng chi nhánh).

> 5-day AI-assisted build. Stack: NestJS + Prisma + PostgreSQL 16 + Redis · Expo + React Native (mobile) · Next.js 15 (portal) · pnpm workspaces · Docker Compose.

---

## 📚 Tài liệu

| File | Mục đích |
|---|---|
| [`docs/spec.md`](docs/spec.md) | Nghiệp vụ, rule check-in, trust score, anti-fraud |
| [`docs/erd.md`](docs/erd.md) | Database schema (Prisma) |
| [`docs/api-spec.md`](docs/api-spec.md) | API contract + error catalog |
| [`docs/CLAUDE.md`](docs/CLAUDE.md) | Context cho AI IDE |
| [`docs/sprint-plan.md`](docs/sprint-plan.md) | Kế hoạch 5-day sprint (checkbox) |
| [`PROMPT_LOG.md`](PROMPT_LOG.md) | Nhật ký làm việc với AI (tiêu chí chấm 15%) |

---

## 🚀 Quick start

### Yêu cầu
- Node ≥ 20.11 + pnpm 10.33
- Docker + Docker Compose

### Chạy bằng Docker (1 lệnh)
```bash
cp .env.example .env
docker compose up -d --build
# → Swagger: http://localhost:3000/api/docs
```

## Quick Start (Docker)

```bash
# 1. Start Postgres & Redis
cd /Users/phuc.nguyen/Documents/Working/FinOS/smart-attendance
docker compose up postgres redis -d

# 2. Reset and seed database (includes 7-day test data)
./scripts/reset-db.sh

# 3. Start API server
cd apps/api
pnpm install
pnpm dev
```

The API will run at: `http://localhost:3000/api/docs` (Swagger UI)

## Test Accounts

The seed script (`scripts/reset-db.sh`) automatically creates the following test accounts. All passwords are: `*@123` with the role name capitalized (e.g., `Admin@123`).

| Role | Email | Password | Scope |
|------|-------|----------|-------|
| **Admin** | `admin@demo.com` | `Admin@123` | Full system |
| **Manager** | `manager.hcm@demo.com` | `Manager@123` | HCM-Q1 branch only |
| **Employee**| `employee001@demo.com` | `Employee@123` | Self only |
| **Employee**| `employee002@demo.com` | `Employee@123` | Self only |

_Note: There are 30 employees named `employee001@demo.com` up to `employee030@demo.com`._

### Portal (Next.js)
```bash
pnpm --filter @sa/portal dev              # http://localhost:3100
```

### Mobile (Expo)
```bash
pnpm --filter @sa/mobile start            # scan QR với dev client
# Yêu cầu EAS Build dev client để test native module (zero-tap Day 5)
```

---

## 🔑 Tài khoản demo

| Role | Email | Mật khẩu |
|---|---|---|
| Admin | `admin@demo.com` | `Admin@123` |
| Manager (HCM) | `manager.hcm@demo.com` | `Manager@123` (Day 2) |
| Employee | `employee001@demo.com` | `Employee@123` (Day 2) |

---

## 🏗 Cấu trúc monorepo

```
smart-attendance/
├── apps/
│   ├── api/              # NestJS + Prisma backend
│   ├── portal/           # Next.js 15 admin/manager portal
│   └── mobile/           # Expo + React Native employee app
├── libs/shared/          # TypeScript types/utils dùng chung (Day 2+)
├── docs/                 # Spec, ERD, API, sprint plan
├── docker-compose.yml
├── .env.example
├── PROMPT_LOG.md
└── README.md
```

---

## 📈 Chiến lược scale (100 chi nhánh × 5.000 nhân viên)

Chi tiết trong [`docs/spec.md §8`](docs/spec.md#8-scale-strategy-100-chi-nhánh--5000-nhân-viên). Highlight:

- **Peak load:** 07:45–08:15, ~10 req/s peak — 1 Node instance xử lý được, nhưng stateless để scale ngang
- **DB:** UNIQUE `(employee_id, work_date)` + index theo `branch_id`/`work_date`/`status`; partition `attendance_events` theo tháng (plan, chưa bật trong MVP)
- **Cache:** Redis TTL 5' cho branch config, 60s cho dashboard aggregate
- **Queue:** BullMQ cho `daily-summary`, `missing-checkout-close`, `report-export`, `anomaly-detection`
- **Read model:** `daily_attendance_summaries` tổng hợp sẵn → dashboard không join raw events
- **Rate limit:** Redis-backed, 10 req/phút/employee cho check-in, 3 req/phút/device cho zero-tap

---

## 🎯 Sprint tracker & Tính năng theo sprint

Xem [`docs/sprint-plan.md`](docs/sprint-plan.md).

### Sprint 1 (Day 1) — Foundation
- Nx monorepo + pnpm workspaces, Docker Compose (Postgres 16 + Redis 7)
- Prisma schema v1, migration + seed cơ bản
- Auth: JWT (access 15m + refresh 7d), RBAC (admin/manager/employee), bcrypt
- Branch CRUD + geofence (lat/lng/radius) + WiFi whitelist (SSID/BSSID)
- Swagger UI tại `/api/docs`, Zod env validation

### Sprint 2 (Day 2) — Core check-in/out
- Employee + EmployeeDevice (auto-register, trust flag)
- `POST /attendance/check-in|check-out` với GPS/WiFi validation
- Work schedule resolver (per-employee + branch default), classify on_time/late/early_leave/overtime
- Impossible-travel detection (haversine > 120 km/h)
- Multi-branch assignment + manager scope guard

### Sprint 3 (Day 3) — History, Dashboard, Audit
- `GET /attendance/me` history (phân trang + filter)
- Manager `GET /attendance/sessions` + detail + override (với audit log bắt buộc)
- Admin dashboard: today summary, anomalies, leaderboard, per-branch drill-down
- Full seed 30 employees × 7 ngày (deterministic fixtures cho demo)

### Sprint 4 (Day 4) — Trust Score v2, Jobs, Reports
- Trust Score 0-100 với 8 risk flags (mock location, impossible travel, new device...) + 3 trust levels (high/medium/low)
- BullMQ jobs: `daily-summary` (cron 00:30), `missing-checkout-close` (cron 23:55), `report-export` (on-demand CSV), `anomaly-detection`
- `DailyAttendanceSummary` read model → dashboard không join raw events
- CSV export theo ngày/chi nhánh + notifications module (in-app + override nudge)
- React Query trên portal + mobile, SDK 54 upgrade, FinOS branding

### Sprint 5 (Day 5) — Zero-tap + QR Kiosk + Multi-factor ✨
- **Zero-tap check-in**: hệ thống tự check-in khi vào vùng chi nhánh + thiết bị tin cậy. Guard 5-AND: policy enabled → consent → not revoked → trusted device → manual quota → window → cooldown. Nonce-based replay protection (UNIQUE device_id × nonce).
- **QR Kiosk mode**: kiosk hiển thị QR rolling 25s, HMAC-SHA256 time-bucketed token (30s bucket). Employee scan QR → backend verify HMAC + trusted device + 1-per-day. Per-branch secret + kiosk token rotation.
- **Multi-factor wifi_scan**: mobile gửi full BSSID scan array (max 50), backend match BẤT KỲ BSSID nào trong whitelist → mạnh hơn single-BSSID đã dễ spoof.
- **Streak & heatmap**: `GET /attendance/me/streak` — current/best streak, on-time rate 30d, heatmap 30 ngày.
- **Face recognition ĐÃ BỎ** khỏi MVP (xem v0.4 changelog trong spec/erd).
- **Portal & Mobile UI**: Đã hoàn thiện toàn màn hình Kiosk `/kiosk/[branchId]`, Mobile tích hợp Camera Scanner với Expo, Streak Widget và bật/tắt thiết lập Zero-tap độc lập trên App.
- **Security & QA**: Throttler Guard (`3 req/min` per-device cho Zero-tap, `5 req/min` Kiosk, `100 req/h` cho QR token), bao phủ kèm e2e test Replay Attack mock hoàn chỉnh.
- **Day 5 hardening (Session #013)**: rename `ZeroTapRevokeReason` enum theo spec (`mock_location_detected/admin_disabled/attestation_failed/branch_disabled/user_opt_out`); auto-revoke device khi phát hiện mock-location / thiếu attestation + cron `zero-tap-revoke-cleanup` (08:00 VN) phục hồi sau 7 ngày; cascade revoke khi admin disable branch policy; manager scope guard cho policy/revoke endpoint; `kiosk_token` lưu sha256 hash + plaintext chỉ trả 1 lần qua `PUT /branches/:id/qr-secret`; QR check-in chặn `BRANCH_NOT_ASSIGNED`; nonce DTO regex `[A-Za-z0-9_-]{16,128}`; full audit log cho rotate/revoke/policy change. **171/171 unit test xanh, build sạch.**

---

## 🧠 AI workflow

1. Mỗi feature đều bắt đầu bằng đọc `docs/spec.md` + `docs/api-spec.md` + `docs/erd.md`
2. AI sinh code → dev review 100% → test → commit
3. Ghi `PROMPT_LOG.md` cho mỗi session: prompt đáng học, prompt phải sửa, quyết định phát sinh

---

## 📄 License

Internal — FinOS Solutions Team.
