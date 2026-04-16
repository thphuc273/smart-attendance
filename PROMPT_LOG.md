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
