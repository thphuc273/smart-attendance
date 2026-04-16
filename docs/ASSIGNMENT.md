Phân tích đề bài và các việc nên làm trước tiên
# ĐỀ BÀI THỰC HÀNH — ĐỘI GIẢI PHÁP SỐ
## SMART ATTENDANCE — CHẤM CÔNG THÔNG MINH
*Đánh giá năng lực sử dụng AI để xây dựng sản phẩm thực tế*

| | | | |
| :--- | :--- | :--- | :--- |
| **Thời gian** | 5 ngày làm việc | **Công cụ AI** | Bất kỳ AI IDE (Claude Code, Cursor, Copilot...) |
| **Quy mô** | **100 chi nhánh — 5.000 nhân viên** | **Tinh thần** | **Sáng tạo & khác biệt!** |

### 1. MÔ TẢ SẢN PHẨM
Xây dựng hệ thống chấm công thông minh cho doanh nghiệp quy mô **100 chi nhánh, 5.000 nhân viên**. Xác định vị trí bằng WiFi và/hoặc GPS. Tính năng bắt buộc nhưng không giới hạn:

* **Check-in/Check-out:** Xác định vị trí qua WiFi SSID/BSSID hoặc GPS geofencing. Chống gian lận (fake GPS, VPN).
* **Quản lý chi nhánh:** CRUD chi nhánh + cấu hình WiFi/GPS hợp lệ cho từng địa điểm. Gán nhân viên vào chi nhánh.
* **Lịch sử & báo cáo:** Xem theo ngày/tuần/tháng, trạng thái (đúng giờ/trễ/vắng), tổng giờ làm, overtime.
* **Dashboard:** Thống kê tổng hợp toàn hệ thống, lọc theo chi nhánh/phòng ban, xuất báo cáo.
* **Phân quyền:** Admin (toàn hệ thống) / Manager (chi nhánh) / Nhân viên (cá nhân).

> ⚡ **YÊU CẦU QUY MÔ — Thiết kế đáp ứng tối thiểu:**
> 100 chi nhánh hoạt động đồng thời • 5.000 nhân viên check-in trong khung giờ cao điểm • Database schema hỗ trợ multi-branch • API phân trang + filter hiệu quả • Giải thích chiến lược scale trong README (có thể chưa cần implement hết, nhưng phải thiết kế sẵn).

> 🏆 **SÁNG TẠO & KHÁC BIỆT: Điểm cộng cho ý tưởng vượt yêu cầu**

### 2. GIT FLOW & DOCKER
* **Git Flow:** `main` ← `develop` ← `feature/*` | `release/*` | `hotfix/*`. Mỗi feature = 1 branch + PR + review. Conventional Commits.
* **Docker:** `docker-compose up` chạy toàn bộ. Dockerfile multi-stage build. `.env.example` đầy đủ, không commit secret.

### 3. SỬ DỤNG AI IDE
* **Context file ở root:** Mô tả kiến trúc, conventions, tech stack (`CLAUDE.md` / `.cursorrules` / `copilot-instructions.md`).
* **Workflow:** Spec → AI generate → Review & refine → Test → Commit. **Review 100% code AI sinh ra.**
* **PROMPT_LOG.md:** Ghi lại prompt + kết quả đạt được. Đây là phần đánh giá quan trọng.

### 4. TIÊU CHÍ ĐÁNH GIÁ
| Tiêu chí | Tỷ trọng | Chi tiết |
| :--- | :---: | :--- |
| Tính năng & UX | **25%** | Check-in/out, multi-branch, dashboard, responsive, dễ dùng |
| Kiến trúc & khả năng mở rộng | **20%** | DB schema multi-branch, API pagination, chiến lược scale |
| Git Flow & Docker | **15%** | Branch, PR, Conventional Commits, 1-click deploy |
| AI IDE workflow & Prompt Log | **15%** | Context file, PROMPT_LOG.md, review process |
| **Sáng tạo & khác biệt** | **25%** | Ý tưởng độc đáo, tính năng vượt yêu cầu, giải pháp thương mại hóa được |

### 5. BÀI NỘP
* **GitHub repo:** Branch history đầy đủ, README setup guide, docker-compose chạy được.
* **Context file + PROMPT_LOG.md:** Ghi lại quá trình làm việc với AI.
* **Demo video 5-10 phút:** Walkthrough + chia sẻ kinh nghiệm + highlight tính năng sáng tạo.