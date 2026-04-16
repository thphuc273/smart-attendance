# SMART ATTENDANCE — API SPEC v0.1

> REST API. Base URL: `/api/v1`. Auth: `Authorization: Bearer <jwt>`.

---

## 1. Convention chung

### 1.1 Response format

**Success:**
```json
{
  "data": { ... } | [ ... ],
  "meta": { "page": 1, "limit": 20, "total": 1234, "total_pages": 62 }
}
```

**Error:**
```json
{
  "error": {
    "code": "INVALID_LOCATION",
    "message": "Vị trí ngoài geofence chi nhánh",
    "details": { "distance_meters": 432 }
  }
}
```

### 1.2 HTTP status

| Code | Khi nào |
|---|---|
| 200 | OK |
| 201 | Created |
| 204 | No content (delete) |
| 400 | Validation error (Zod/class-validator) |
| 401 | Chưa auth / token hết hạn |
| 403 | Sai role / sai branch scope |
| 404 | Resource không tồn tại |
| 409 | Conflict (vd: đã check-in rồi) |
| 422 | Business rule fail (vd: ngoài geofence + WiFi sai) |
| 429 | Rate limit |
| 500 | Server error |

### 1.3 Pagination & filter (query params)

- `page` (default 1), `limit` (default 20, max 100)
- `sort` = `field:asc|desc`, ví dụ `?sort=created_at:desc`
- Filter: `?branch_id=...&date_from=2026-04-01&date_to=2026-04-30&status=late`

### 1.4 Auth header

```
Authorization: Bearer <access_token>
```

Refresh token lưu httpOnly cookie cho web, secure storage cho mobile.

---

## 2. Auth module

### POST `/auth/login`
**Public.**
```json
// Request
{ "email": "admin@demo.com", "password": "Admin@123" }

// Response 200
{
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "user": {
      "id": "uuid",
      "email": "admin@demo.com",
      "full_name": "Admin User",
      "roles": ["admin"]
    }
  }
}
```
**Errors:** 401 `INVALID_CREDENTIALS`, 429 `TOO_MANY_ATTEMPTS`

### POST `/auth/refresh`
```json
{ "refresh_token": "eyJ..." }
// → { "data": { "access_token": "...", "refresh_token": "..." } }
```

### POST `/auth/logout`
Auth required. Invalidate refresh token.

### GET `/auth/me`
Auth required.
```json
{
  "data": {
    "id": "uuid", "email": "...", "full_name": "...",
    "roles": ["employee"],
    "employee": {
      "id": "uuid", "employee_code": "EMP001",
      "primary_branch": { "id": "uuid", "name": "HCM-Q1" },
      "department": { "id": "uuid", "name": "Engineering" }
    }
  }
}
```

---

## 3. Branches module

### GET `/branches`
**Roles:** admin (all), manager (assigned only)
Query: `?page=1&limit=20&status=active&search=hcm`
```json
{
  "data": [
    {
      "id": "uuid", "code": "HCM-Q1", "name": "HCM Quận 1",
      "address": "...", "latitude": 10.7769, "longitude": 106.7009,
      "status": "active", "employee_count": 17
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 3, "total_pages": 1 }
}
```

### POST `/branches`
**Role:** admin
```json
{
  "code": "HCM-Q1",
  "name": "HCM Quận 1",
  "address": "123 Lê Lợi",
  "latitude": 10.7769,
  "longitude": 106.7009,
  "radius_meters": 150,
  "timezone": "Asia/Ho_Chi_Minh"
}
```

### GET `/branches/:id`
Trả về branch + wifi_configs + geofences (eager).

### PATCH `/branches/:id`
Partial update. Audit log.

### DELETE `/branches/:id`
Soft delete (`status = inactive`). 409 nếu còn nhân viên active.

### Sub-resource: WiFi config

#### GET `/branches/:id/wifi-configs`
```json
{
  "data": [
    { "id": "uuid", "ssid": "Office-5G", "bssid": "aa:bb:cc:dd:ee:ff",
      "is_active": true, "priority": 1 }
  ]
}
```

#### POST `/branches/:id/wifi-configs`
```json
{ "ssid": "Office-5G", "bssid": "aa:bb:cc:dd:ee:ff", "priority": 1 }
```

#### DELETE `/branches/:id/wifi-configs/:configId`

### Sub-resource: Geofence

#### GET `/branches/:id/geofences`
#### POST `/branches/:id/geofences`
```json
{ "name": "Main entrance", "center_lat": 10.7769, "center_lng": 106.7009, "radius_meters": 100 }
```

---

## 4. Employees module

### GET `/employees`
**Roles:** admin (all), manager (own branches)
Filter: `?branch_id=...&department_id=...&status=active&search=...`
```json
{
  "data": [
    {
      "id": "uuid", "employee_code": "EMP001",
      "user": { "full_name": "Nguyễn Văn A", "email": "a@demo.com" },
      "primary_branch": { "id": "uuid", "name": "HCM-Q1" },
      "department": { "id": "uuid", "name": "Engineering" },
      "employment_status": "active"
    }
  ],
  "meta": { ... }
}
```

### POST `/employees`
**Role:** admin
Tạo user + employee atomic.
```json
{
  "email": "new@demo.com",
  "password": "Temp@123",
  "full_name": "Nguyễn Văn B",
  "phone": "0901234567",
  "employee_code": "EMP031",
  "primary_branch_id": "uuid",
  "department_id": "uuid",
  "role": "employee"
}
```

### PATCH `/employees/:id`
### POST `/employees/:id/assignments`
```json
{ "branch_id": "uuid", "assignment_type": "secondary",
  "effective_from": "2026-04-15", "effective_to": "2026-05-15" }
```

### GET `/employees/:id/devices`
```json
{
  "data": [
    { "id": "uuid", "device_name": "iPhone 14", "platform": "ios",
      "is_trusted": true, "last_seen_at": "2026-04-15T08:01:23Z" }
  ]
}
```

### PATCH `/employees/:id/devices/:deviceId`
```json
{ "is_trusted": true }
```

---

## 5. Attendance module

### POST `/attendance/check-in`
**Role:** employee (self only)
```json
// Request
{
  "latitude": 10.7770,
  "longitude": 106.7010,
  "accuracy_meters": 12,
  "ssid": "Office-5G",
  "bssid": "aa:bb:cc:dd:ee:ff",
  "device_fingerprint": "ios-abc123def456",
  "platform": "ios",
  "device_name": "iPhone 14",
  "app_version": "1.0.0",
  "is_mock_location": false
}

// Response 201 (success)
{
  "data": {
    "session_id": "uuid",
    "event_id": "uuid",
    "status": "on_time",
    "validation_method": "gps_wifi",
    "trust_score": 90,
    "trust_level": "trusted",
    "risk_flags": [],
    "check_in_at": "2026-04-15T08:05:12Z",
    "branch": { "id": "uuid", "name": "HCM-Q1" }
  }
}

// Response 422 (failed validation, vẫn log event)
{
  "error": {
    "code": "INVALID_LOCATION",
    "message": "Vị trí ngoài geofence và WiFi không khớp",
    "details": {
      "event_id": "uuid",
      "trust_score": 0,
      "risk_flags": ["outside_geofence", "wifi_mismatch"],
      "distance_meters": 432
    }
  }
}
```

**Errors:**
- 409 `ALREADY_CHECKED_IN` (đã check-in success hôm nay)
- 422 `INVALID_LOCATION` (geofence + wifi đều fail)
- 422 `NOT_ASSIGNED_TO_BRANCH`
- 429 `RATE_LIMIT_EXCEEDED`

### POST `/attendance/check-out`
Tương tự. Update `check_out_at`, `worked_minutes`, `overtime_minutes`, `status`.

### GET `/attendance/me`
**Role:** employee
Filter: `?date_from=2026-04-01&date_to=2026-04-30&page=1&limit=20`
```json
{
  "data": [
    {
      "id": "uuid", "work_date": "2026-04-15",
      "check_in_at": "2026-04-15T08:05:12Z",
      "check_out_at": "2026-04-15T17:32:00Z",
      "worked_minutes": 567, "overtime_minutes": 32,
      "status": "on_time", "trust_score": 88
    }
  ],
  "meta": { ... }
}
```

### GET `/attendance/sessions`
**Roles:** manager (own branches), admin (all)
Filter: `?branch_id=...&employee_id=...&date_from=...&date_to=...&status=late`

### GET `/attendance/sessions/:id`
Trả session + tất cả events (chi tiết).
```json
{
  "data": {
    "id": "uuid", "work_date": "2026-04-15",
    "employee": { "id": "uuid", "employee_code": "EMP001", "full_name": "..." },
    "branch": { "id": "uuid", "name": "HCM-Q1" },
    "check_in_at": "...", "check_out_at": "...",
    "worked_minutes": 567, "status": "on_time", "trust_score": 88,
    "events": [
      {
        "id": "uuid", "event_type": "check_in", "status": "success",
        "validation_method": "gps_wifi", "trust_score": 90,
        "latitude": 10.7770, "longitude": 106.7010, "accuracy_meters": 12,
        "ssid": "Office-5G", "bssid": "aa:bb:cc:dd:ee:ff",
        "risk_flags": [], "created_at": "2026-04-15T08:05:12Z"
      }
    ]
  }
}
```

### PATCH `/attendance/sessions/:id`
**Role:** manager (own branch), admin
Manager override (vd: sửa status, thêm note). Audit log bắt buộc.
```json
{
  "status": "on_time",
  "note": "Mạng lỗi, đã xác nhận thủ công"
}
```

---

## 5B. Zero-tap module (background check-in)

Nhân viên không cần mở app, không cần chạm. Device đăng ký consent → OS phát sự kiện (WiFi connect / geofence enter) → background worker gọi endpoint dưới đây.

> Guardrails: device **phải** `is_trusted`, **phải** opt-in, **phải** trong `zero_tap_window` của branch, **phải** kèm attestation token. Xem `docs/spec.md` §4.3, §5.6, §6 lớp 4.

### POST `/attendance/zero-tap/check-in`
**Role:** employee (self, background). **Auth:** JWT + `X-Device-Attestation` header.
```json
// Request
{
  "latitude": 10.7770,
  "longitude": 106.7010,
  "accuracy_meters": 12,
  "ssid": "Office-5G",
  "bssid": "aa:bb:cc:dd:ee:ff",
  "device_fingerprint": "ios-abc123def456",
  "platform": "ios",
  "app_version": "1.0.0",
  "is_mock_location": false,
  "device_lock_enabled": true,
  "trigger": "zero_tap_wifi",          // zero_tap_wifi | zero_tap_geofence | zero_tap_silent_push
  "trigger_at": "2026-04-16T08:03:11Z", // client OS fire time (server reject nếu lệch > 90s)
  "nonce": "01JKQ8Z7X..."               // UUID v7, chống replay — UNIQUE per device
}

// Response 201
{
  "data": {
    "session_id": "uuid",
    "event_id": "uuid",
    "status": "on_time",
    "validation_method": "gps_wifi",
    "trust_score": 85,
    "trust_level": "trusted",
    "trigger": "zero_tap_wifi",
    "silent": true,
    "risk_flags": [],
    "check_in_at": "2026-04-16T08:03:12Z",
    "branch": { "id": "uuid", "name": "HCM-Q1" },
    "notification_title": "Đã check-in tự động",
    "notification_body": "08:03 tại HCM-Q1 · Trust 85/100"
  }
}
```

**Errors (zero-tap specific):**
- 401 `ATTESTATION_FAILED` — Play Integrity / App Attest token invalid
- 403 `ZERO_TAP_NOT_CONSENTED` — chưa opt-in trên device này
- 403 `ZERO_TAP_BRANCH_DISABLED` — branch tắt zero-tap
- 409 `ZERO_TAP_COOLDOWN` — chưa đủ cooldown (detail: `retry_after_seconds`)
- 409 `ZERO_TAP_REPLAY` — `nonce` đã dùng hoặc `trigger_at` lệch > 90s
- 422 `DEVICE_NOT_TRUSTED_FOR_ZERO_TAP` — device chưa đủ manual check-in (`min_manual_checkins_to_enable`)
- 422 `ZERO_TAP_OUTSIDE_WINDOW` — ngoài `zero_tap_window`
- 422 `DEVICE_LOCK_REQUIRED` — client report màn hình khóa chưa bật

### POST `/attendance/zero-tap/check-out`
Tương tự. `trigger` thường là `zero_tap_geofence` (exit) hoặc `zero_tap_wifi` (disconnect >5 phút).

### GET `/attendance/zero-tap/settings/me`
**Role:** employee. Trả về cấu hình hiện tại cho device đang gọi (header `X-Device-Fingerprint`).
```json
{
  "data": {
    "device_id": "uuid",
    "zero_tap_enabled": true,
    "zero_tap_consent_at": "2026-04-10T03:12:00Z",
    "eligible": true,
    "eligibility_checks": {
      "device_trusted": true,
      "min_manual_checkins_reached": true,
      "attestation_valid": true,
      "device_lock_enabled": true
    },
    "active_branches": [
      {
        "id": "uuid",
        "name": "HCM-Q1",
        "zero_tap_enabled": true,
        "check_in_window": ["07:00", "09:30"],
        "check_out_window": ["17:00", "20:00"]
      }
    ]
  }
}
```

### PATCH `/attendance/zero-tap/settings/me`
**Role:** employee. Toggle consent cho device hiện tại.
```json
// Request
{ "zero_tap_enabled": true }

// Response 200
{ "data": { "zero_tap_enabled": true, "zero_tap_consent_at": "2026-04-16T08:00:00Z" } }
```
Tắt → ghi `zero_tap_revoked_at` + `zero_tap_revoke_reason = user_opt_out`. Có hiệu lực ngay (không cache).

### GET `/branches/:id/zero-tap-policy`
**Role:** admin (all), manager (own)
```json
{
  "data": {
    "branch_id": "uuid",
    "enabled": true,
    "check_in_window_start": "07:00",
    "check_in_window_end": "09:30",
    "check_out_window_start": "17:00",
    "check_out_window_end": "20:00",
    "cooldown_seconds": 600,
    "trust_score_deduction": 5,
    "require_device_trusted": true,
    "require_attestation": true,
    "min_manual_checkins_to_enable": 2
  }
}
```

### PUT `/branches/:id/zero-tap-policy`
**Role:** admin. Audit log bắt buộc.

### POST `/employees/:id/devices/:deviceId/revoke-zero-tap`
**Role:** admin, manager (own branch). Buộc revoke consent trên device cụ thể khi có dấu hiệu lạm dụng. Ghi `zero_tap_revoke_reason = admin_disabled`.

---

## 6. Reports module

### GET `/reports/daily-summary`
Filter: `?branch_id=...&department_id=...&date_from=...&date_to=...`
```json
{
  "data": [
    {
      "work_date": "2026-04-15",
      "branch_id": "uuid",
      "total_employees": 17,
      "on_time": 14, "late": 2, "absent": 1,
      "avg_worked_minutes": 532, "total_overtime_minutes": 124
    }
  ]
}
```

### GET `/reports/branch/:id`
Aggregate cho 1 chi nhánh theo khoảng thời gian.

### POST `/reports/export`
Trigger BullMQ job, không block.
```json
// Request
{
  "type": "attendance_csv",
  "branch_id": "uuid",
  "date_from": "2026-04-01",
  "date_to": "2026-04-30"
}
// Response 202
{ "data": { "job_id": "uuid", "status": "queued" } }
```

### GET `/reports/export/:jobId`
```json
{
  "data": {
    "job_id": "uuid",
    "status": "completed",
    "download_url": "/api/v1/reports/export/:jobId/download",
    "expires_at": "2026-04-15T09:00:00Z"
  }
}
```
Status: `queued | processing | completed | failed`

### GET `/reports/export/:jobId/download`
Stream CSV.

---

## 7. Dashboard module

### GET `/dashboard/admin/overview`
**Role:** admin
```json
{
  "data": {
    "total_employees": 5000,
    "total_branches": 100,
    "today": {
      "checked_in": 4321,
      "on_time": 4100,
      "late": 221,
      "absent": 679,
      "on_time_rate": 0.948
    },
    "top_branches_on_time": [
      { "branch_id": "uuid", "name": "HCM-Q1", "rate": 0.98 }
    ],
    "top_branches_late": [
      { "branch_id": "uuid", "name": "HN-CG", "late_count": 45 }
    ],
    "checkin_heatmap": [
      { "hour": 7, "count": 234 },
      { "hour": 8, "count": 3210 },
      { "hour": 9, "count": 877 }
    ]
  }
}
```

### GET `/dashboard/manager/:branchId`
**Role:** manager (own only), admin
```json
{
  "data": {
    "branch": { "id": "uuid", "name": "HCM-Q1" },
    "today": {
      "total": 17, "checked_in": 15, "not_yet": 1, "absent": 1,
      "on_time": 14, "late": 1
    },
    "low_trust_today": [
      {
        "session_id": "uuid",
        "employee": { "code": "EMP005", "name": "..." },
        "trust_score": 35,
        "risk_flags": ["mock_location"]
      }
    ],
    "week_trend": [
      { "date": "2026-04-09", "on_time_rate": 0.94 }
    ]
  }
}
```

### GET `/dashboard/anomalies`
**Roles:** admin, manager
```json
{
  "data": {
    "branches_late_spike": [
      { "branch_id": "uuid", "name": "HN-CG",
        "late_rate_today": 0.18, "late_rate_avg_7d": 0.05,
        "spike_ratio": 3.6 }
    ],
    "employees_low_trust": [
      { "employee_id": "uuid", "code": "EMP005",
        "low_trust_count_7d": 4 }
    ],
    "untrusted_devices_new_today": 3
  }
}
```

---

## 8. Work schedules module

### GET `/work-schedules`
### POST `/work-schedules`
```json
{
  "name": "Standard 8-5",
  "start_time": "08:00",
  "end_time": "17:00",
  "grace_minutes": 10,
  "overtime_after_minutes": 60,
  "workdays": [1, 2, 3, 4, 5]
}
```

### POST `/work-schedules/:id/assign`
```json
{
  "employee_id": "uuid",
  "effective_from": "2026-04-15",
  "effective_to": null
}
```

---

## 9. Audit logs (read-only)

### GET `/audit-logs`
**Role:** admin
Filter: `?user_id=...&entity_type=branch&date_from=...`
```json
{
  "data": [
    {
      "id": "uuid", "user": { "email": "manager@..." },
      "action": "override", "entity_type": "attendance_session",
      "entity_id": "uuid",
      "before": { "status": "late" }, "after": { "status": "on_time" },
      "ip_address": "...", "created_at": "..."
    }
  ]
}
```

---

## 10. Error code catalog

| Code | HTTP | Mô tả |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Sai email/password |
| `TOKEN_EXPIRED` | 401 | Access token hết hạn |
| `INSUFFICIENT_PERMISSION` | 403 | Sai role |
| `BRANCH_OUT_OF_SCOPE` | 403 | Manager truy cập branch không thuộc quyền |
| `RESOURCE_NOT_FOUND` | 404 | |
| `ALREADY_CHECKED_IN` | 409 | Đã có session success hôm nay |
| `ALREADY_CHECKED_OUT` | 409 | |
| `NOT_CHECKED_IN_YET` | 409 | Chưa check-in mà gọi check-out |
| `INVALID_LOCATION` | 422 | Cả GPS và WiFi đều không pass |
| `NOT_ASSIGNED_TO_BRANCH` | 422 | Nhân viên không có assignment active với chi nhánh phát hiện |
| `MOCK_LOCATION_DETECTED` | 422 | Block trong môi trường strict |
| `VALIDATION_ERROR` | 400 | Body không hợp lệ (DTO) |
| `RATE_LIMIT_EXCEEDED` | 429 | |
| `ATTESTATION_FAILED` | 401 | Play Integrity / App Attest token sai hoặc hết hạn |
| `ZERO_TAP_NOT_CONSENTED` | 403 | Device chưa opt-in zero-tap |
| `ZERO_TAP_BRANCH_DISABLED` | 403 | Branch đã tắt zero-tap |
| `ZERO_TAP_COOLDOWN` | 409 | Chưa đủ `cooldown_seconds` giữa 2 trigger |
| `ZERO_TAP_REPLAY` | 409 | `nonce` đã dùng hoặc `trigger_at` lệch > 90s |
| `ZERO_TAP_OUTSIDE_WINDOW` | 422 | Ngoài `zero_tap_window` của branch |
| `DEVICE_NOT_TRUSTED_FOR_ZERO_TAP` | 422 | Device chưa đủ manual check-in |
| `DEVICE_LOCK_REQUIRED` | 422 | Màn hình khóa sinh trắc học chưa bật |

---

## 11. Rate limit (Redis-backed)

| Endpoint | Limit |
|---|---|
| `POST /auth/login` | 5 / phút / IP |
| `POST /attendance/check-in` | 10 / phút / employee |
| `POST /attendance/check-out` | 10 / phút / employee |
| `POST /attendance/zero-tap/check-in` | 3 / phút / device (cooldown server-side riêng) |
| `POST /attendance/zero-tap/check-out` | 3 / phút / device |
| `PATCH /attendance/zero-tap/settings/me` | 10 / giờ / employee |
| `POST /reports/export` | 3 / phút / user |
| Other admin APIs | 60 / phút / user |

Header response:
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1713168000
```

---

## 12. OpenAPI

API sẽ expose `/api/docs` (Swagger UI) auto-generated từ NestJS decorators.

---

## 13. Changelog

- **v0.2** (2026-04-16): Thêm module §5B zero-tap (check-in/out, settings, branch policy, admin revoke), 8 error code mới, rate limit zero-tap, header `X-Device-Attestation` + `X-Device-Fingerprint`.
- **v0.1** (2026-04-15): Bản đầu tiên, đầy đủ 8 module.
