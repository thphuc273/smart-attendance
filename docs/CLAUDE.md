# CLAUDE.md — AI IDE Context File

> File này định hướng cho Claude Code / Cursor / Copilot khi sinh code cho dự án **Smart Attendance**. Đọc file này TRƯỚC khi viết bất kỳ feature nào.

---

## 1. Sản phẩm

**Smart Attendance** — hệ thống chấm công thông minh cho doanh nghiệp **100 chi nhánh, 5.000 nhân viên**. Check-in/out qua GPS geofencing + WiFi SSID/BSSID, chấm điểm độ tin cậy (Trust Score), phát hiện bất thường.

**Tài liệu nguồn (đọc trước khi code):**
- [`docs/spec.md`](docs/spec.md) — rule nghiệp vụ
- [`docs/erd.md`](docs/erd.md) — schema database
- [`docs/api-spec.md`](docs/api-spec.md) — API contract

---

## 2. Tech stack

| Lớp | Công nghệ |
|---|---|
| Monorepo | **Nx** |
| Backend | **NestJS** + **Prisma** |
| Database | **PostgreSQL 16** |
| Cache/Queue | **Redis** + **BullMQ** |
| Mobile | **Expo (SDK 51+) + React Native** (TypeScript) |
| Web Portal | **Next.js 15 (App Router) + React 19 + Tailwind** |
| Auth | **JWT** access + refresh |
| Test | **Jest** (unit), **Supertest** (e2e) |
| Container | **Docker Compose** |

**Không thay đổi stack** mà không hỏi.

---

## 3. Cấu trúc monorepo

```
smart-attendance/
├── apps/
│   ├── api/              # NestJS backend
│   ├── portal/           # Next.js web portal (admin/manager)
│   └── mobile/           # Expo + React Native (employee app)
├── libs/
│   ├── shared/types/     # TypeScript types dùng chung (DTOs)
│   ├── shared/constants/ # Enum, error codes
│   ├── shared/utils/     # Pure functions (geo, trust score)
│   └── api/              # NestJS modules (auth, attendance, ...)
│       ├── auth/
│       ├── branches/
│       ├── employees/
│       ├── attendance/        # manual check-in/out
│       ├── zero-tap/          # background check-in/out + consent + policy
│       ├── reports/
│       └── dashboard/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── docs/
├── docker/
├── docker-compose.yml
├── .env.example
├── CLAUDE.md
├── PROMPT_LOG.md
└── README.md
```

---

## 4. Coding conventions

### 4.1 General
- **TypeScript strict mode** bật toàn bộ
- **No `any`** trừ khi unavoidable (kèm comment giải thích)
- **ESLint + Prettier** auto-format khi save
- **Naming:** `camelCase` biến/hàm, `PascalCase` class/type, `SCREAMING_SNAKE` const
- **Files:** `kebab-case.ts` (vd: `attendance.service.ts`)
- **Imports:** absolute path qua tsconfig paths (`@smart-attendance/shared/types`)

### 4.2 NestJS
- 1 module / 1 thư mục, structure: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `entities/` (nếu cần)
- DTO dùng **class-validator** + **class-transformer**
- Tất cả endpoint có guard `@UseGuards(JwtAuthGuard, RolesGuard)`
- Custom decorator `@Roles('admin')`, `@CurrentUser()`
- Error: throw `HttpException` con (vd: `BadRequestException`) hoặc custom `BusinessException`
- Service không trả raw Prisma model — luôn map qua DTO/response shape
- Inject Prisma qua `PrismaService` (không gọi `new PrismaClient()`)

### 4.3 Prisma
- Tên model: `PascalCase` (Prisma) → `snake_case` table (`@@map`)
- Tên field: `camelCase` (Prisma) → `snake_case` column (`@map`)
- Relation: dùng explicit FK field + relation field
- Migration: 1 PR = 1 migration mới, **không sửa migration đã merge**
- Seed bằng `prisma/seed.ts`, idempotent (upsert)

### 4.4 API response
Tuân thủ format trong [`docs/api-spec.md`](docs/api-spec.md):
```typescript
// Success
{ data: T | T[], meta?: PaginationMeta }
// Error
{ error: { code: string, message: string, details?: any } }
```

Wrap qua interceptor `ResponseTransformInterceptor`.

### 4.5 Mobile (Expo + React Native)
- **Expo SDK 51+**, TypeScript strict, **expo-router** (file-based routing, layout segments)
- **Prebuild** bắt buộc (`npx expo prebuild`) để có `ios/`, `android/` — vì cần native modules cho zero-tap (WiFi info, Geofencing, Play Integrity, App Attest)
- **EAS Build** cho dev/preview/production profile; không dùng `expo go` cho feature cần native
- State: **Zustand** (đơn giản) hoặc **TanStack Query** cho server state — không Redux
- Styling: **NativeWind** (Tailwind cho RN) — không StyleSheet rải rác
- Form: **react-hook-form** + **zod** resolver — dùng chung schema với backend qua `libs/shared/types`
- API client: **ky** hoặc **axios** wrapper trong `libs/shared/api-client` (dùng chung với web portal)
- Auth storage: **expo-secure-store** cho refresh token, không AsyncStorage
- Packages zero-tap:
  - `expo-location` — `startGeofencingAsync()` chạy kể cả app terminated
  - `expo-task-manager` — định nghĩa background task cho geofence enter/exit
  - `expo-network` — detect WiFi SSID/BSSID (cần native module bổ sung cho BSSID, xem §5.6 spec)
  - `expo-notifications` — local notification sau zero-tap success
  - `expo-device` + `expo-crypto` — device fingerprint, nonce (UUID v7)
  - `react-native-play-integrity` (Android), `react-native-ios-app-attest` (iOS) — attestation token

### 4.6 Web portal (Next.js)
- App Router, RSC mặc định — chỉ `'use client'` khi cần
- Fetch data trong server components với `fetch` + `revalidate`; mutation qua route handlers
- UI: **shadcn/ui** + **Tailwind**
- State: **Zustand** cho client state, TanStack Query cho server state tương tác
- Form: react-hook-form + zod (dùng chung schema với mobile)

### 4.6 Testing
- Unit test cho mọi service (logic nghiệp vụ): trust score, validation, schedule
- E2E test cho golden path: login → check-in → check-out → xem lịch sử
- Test naming: `should <expected> when <condition>`
- Coverage tối thiểu 60% cho `libs/api/*` services

---

## 5. Nguyên tắc thiết kế

### 5.1 Multi-branch ngay từ đầu
- Mọi query attendance/employee/report **PHẢI** có filter `branch_id` (admin có thể skip)
- Manager guard kiểm tra `branch_id ∈ user.managed_branches`
- Không hard-code branch ở bất kỳ đâu

### 5.2 Pagination mặc định
- Mọi list endpoint trả `data + meta`, default `limit=20, max=100`
- Không bao giờ `findMany()` không limit (dù có filter)

### 5.3 Validation 2 lớp
- **Lớp 1 (DTO):** class-validator format, type, required
- **Lớp 2 (Service):** business rule (geofence, schedule, role scope)

### 5.4 Trust Score logic
File duy nhất: `libs/shared/utils/trust-score.ts`
- Pure function, dễ test
- Input: `{ gps, wifi, device, history }`
- Output: `{ score: 0-100, flags: string[], method: ValidationMethod }`

### 5.5 Anti-fraud
- **KHÔNG** trust input từ client mù quáng (đặc biệt `is_mock_location`)
- Luôn cross-check: GPS + WiFi + device + history
- Mọi failed attempt **vẫn log** vào `attendance_events`
- Manager override **bắt buộc** ghi `audit_logs`

### 5.6 Zero-tap check-in (flagship differentiator)
- Background check-in qua WiFi/geofence trigger — xem [`docs/spec.md`](docs/spec.md) §4.3, §5.6
- **Bắt buộc đủ tất cả:** device `is_trusted` + `zero_tap_enabled` + `min_manual_checkins_to_enable` + attestation (Play Integrity / App Attest) + trong `zero_tap_window` + cooldown + `nonce` unique
- Endpoint riêng: `POST /attendance/zero-tap/check-{in,out}` — **KHÔNG** reuse endpoint manual
- Tách logic validation: `libs/shared/utils/zero-tap-guard.ts` (pure function, test kỹ)
- Trust score trừ 5 điểm base (xem §5.6 spec)
- Mọi zero-tap event **phải** gửi local notification về device (minh bạch với nhân viên)
- Mock location detected trong zero-tap → auto revoke device 7 ngày + audit log

### 5.7 Performance
- Index DB theo [`docs/erd.md`](docs/erd.md) §4
- Cache branch config (geofence, wifi) trong Redis TTL 5'
- Dashboard query đọc từ `daily_attendance_summaries` (read model), không join raw events
- Heavy operation (export) → BullMQ job, không block request

---

## 6. Git conventions

### 6.1 Branch
- `main` — production-ready
- `develop` — integration
- `feature/<scope>-<short-desc>` (vd: `feature/attendance-checkin-validation`)
- `release/<version>`, `hotfix/<issue>`

### 6.2 Commit (Conventional Commits)
```
<type>(<scope>): <subject>

[optional body]
[optional footer]
```
**Type:** `feat`, `fix`, `chore`, `refactor`, `test`, `docs`, `style`, `perf`, `ci`
**Ví dụ:**
- `feat(attendance): add GPS+WiFi validation for check-in`
- `fix(auth): handle expired refresh token`
- `chore(docker): add redis service to compose`

### 6.3 PR
- 1 feature = 1 PR
- Title = commit subject
- Body: gì thay đổi + why + screenshot (nếu UI)
- Self-review trước khi assign

---

## 7. AI workflow rule

### 7.1 Trước khi sinh code
1. Đọc `docs/spec.md` mục liên quan
2. Đọc `docs/api-spec.md` cho endpoint contract
3. Đọc `docs/erd.md` cho schema
4. Tham chiếu module tương tự đã có

### 7.2 Khi sinh code
- **KHÔNG** tạo file/folder ngoài structure đã định
- **KHÔNG** thêm dependency mới mà không hỏi
- **KHÔNG** dùng deprecated API
- **PHẢI** tuân naming convention
- **PHẢI** thêm DTO + validation
- **PHẢI** thêm guard cho endpoint cần auth
- **PHẢI** thêm test case cho logic nghiệp vụ

### 7.3 Sau khi sinh code
- Người dev **review 100%** code AI sinh ra
- Ghi vào `PROMPT_LOG.md`: prompt + AI output + chỉnh sửa + kết quả

---

## 8. Forbidden / Avoid

- ❌ `console.log` trong production code (dùng `Logger`)
- ❌ Hard-code secret, URL, credential
- ❌ Comment kiểu `// added by AI`, `// TODO later`
- ❌ Class component React — luôn function component + hooks
- ❌ Dùng Expo Go cho build có native module (WiFi, Play Integrity…) — bắt buộc dev client qua EAS
- ❌ AsyncStorage lưu token — dùng `expo-secure-store`
- ❌ `findMany()` không có `take`
- ❌ Đọc raw Prisma model trong controller — phải qua service + DTO
- ❌ Catch `Error` mà nuốt — luôn log + rethrow hoặc throw HttpException

---

## 9. Khi không chắc

**Hỏi user, không đoán.** Đặc biệt khi:
- Thay đổi schema database
- Thêm dependency mới
- Đổi API contract
- Thay đổi rule nghiệp vụ
- Refactor cross-module

---

## 10. Quick reference

| Cần | File |
|---|---|
| Rule check-in | `docs/spec.md` §4.1, §5 |
| Trust score logic | `docs/spec.md` §5.2 + `libs/shared/utils/trust-score.ts` |
| **Zero-tap check-in** | `docs/spec.md` §4.3, §5.6, §6 lớp 4 + `libs/shared/utils/zero-tap-guard.ts` |
| Zero-tap API | `docs/api-spec.md` §5B |
| Schema bảng X | `docs/erd.md` §3 |
| API endpoint Y | `docs/api-spec.md` |
| Error code | `docs/api-spec.md` §10 |
| Rate limit | `docs/api-spec.md` §11 |
| MVP scope | `docs/spec.md` §11 |
| Test account | `docs/spec.md` §12 |
