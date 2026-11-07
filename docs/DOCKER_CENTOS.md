# Cài kiro-rs bằng Docker trên VPS CentOS

Tài liệu này dùng image build sẵn trên GitHub Actions và push lên GHCR.
VPS **không cần build Rust**, chỉ cần pull image về chạy.

- Image: `ghcr.io/nv876620-design/kiro-rs:latest`
- Workflow: `.github/workflows/docker-build.yaml`
- Kiến trúc mặc định: `linux/amd64` (VPS CentOS x86_64)

> Nếu VPS là ARM64, sửa `platforms: linux/amd64` trong workflow thành `linux/arm64`.

---

## 1. Cài Docker

### CentOS Stream 9 / Rocky Linux 9 / AlmaLinux 9

```bash
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo \
  https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf -y install docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
```

### CentOS 7

CentOS 7 đã hết hỗ trợ từ 06/2024. Nếu vẫn dùng CentOS 7:

```bash
sudo yum -y install yum-utils
sudo yum-config-manager --add-repo \
  https://download.docker.com/linux/centos/docker-ce.repo
sudo yum -y install docker-ce docker-ce-cli containerd.io
sudo systemctl enable --now docker
sudo docker run --rm hello-world
```

Nếu repo Docker hoặc mirror CentOS lỗi, nên nâng cấp lên CentOS Stream 9 / Rocky 9 / AlmaLinux 9.

Cài Docker Compose v2 nếu `docker compose` chưa có:

```bash
sudo curl -SL \
  https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
docker-compose version
```

---

## 2. Tạo thư mục và lấy file compose

```bash
sudo mkdir -p /opt/kiro-rs
cd /opt/kiro-rs

sudo curl -fsSLO \
  https://raw.githubusercontent.com/nv876620-design/kiro.rs/master/docker-compose.yml

sudo mkdir -p config
```

---

## 3. Đưa config và credentials lên VPS

Từ máy local, copy 2 file cần thiết:

```bash
scp config.json root@YOUR_VPS_IP:/opt/kiro-rs/config/config.json
scp credentials.json root@YOUR_VPS_IP:/opt/kiro-rs/config/credentials.json
```

Trên VPS, phân quyền:

```bash
sudo chmod 600 /opt/kiro-rs/config/config.json
sudo chmod 600 /opt/kiro-rs/config/credentials.json
```

### Sửa `config.json`

Bắt buộc đổi:

```json
"host": "0.0.0.0"
```

Giữ nguyên `"port": 8990`.

Kiểm tra thêm:

- `apiKey`: key cho client gọi API
- `adminApiKey`: key đăng nhập Admin UI
- `proxyUrl` / `proxyUsername` / `proxyPassword`: chỉ đặt nếu VPS cần proxy ra ngoài
- `quotaResetRecoveryEnabled`: giữ `false` nếu không dùng

Không đưa `config.json` và `credentials.json` lên Git.

---

## 4. Đăng nhập GHCR và pull image

Image mặc định là **private**. Chọn 1 trong 2 cách:

### Cách A — để package public (đơn giản)

Vào GitHub:

```text
Profile → Packages → kiro-rs → Package settings
→ Change visibility → Public
```

Sau đó VPS pull không cần login:

```bash
sudo docker pull ghcr.io/nv876620-design/kiro-rs:latest
```

### Cách B — dùng token để pull image private

Tạo GitHub PAT (classic) có quyền `read:packages`, rồi:

```bash
echo 'YOUR_GHCR_TOKEN' | \
  sudo docker login ghcr.io -u nv876620-design --password-stdin

sudo docker pull ghcr.io/nv876620-design/kiro-rs:latest
```

Token chỉ cần quyền đọc package, không cần quyền ghi repo.

---

## 5. Chạy container

```bash
cd /opt/kiro-rs

sudo IMAGE_OWNER=ghcr.io/nv876620-design \
     IMAGE_TAG=latest \
     docker compose up -d
```

Kiểm tra:

```bash
sudo docker compose ps
sudo docker compose logs -f kiro-rs
curl http://127.0.0.1:8990/healthz
```

Mở Admin UI:

```text
http://YOUR_VPS_IP:8990/admin
```

Nếu chỉ muốn truy cập qua SSH tunnel:

```bash
ssh -L 8990:127.0.0.1:8990 root@YOUR_VPS_IP
```

Sau đó mở `http://127.0.0.1:8990/admin` trên máy local.

---

## 6. SELinux trên CentOS

Nếu container không đọc được file trong `config/`, thêm `:Z` vào volume trong `docker-compose.yml`:

```yaml
volumes:
  - ./config/:/app/config/:Z
```

Hoặc:

```bash
sudo chcon -Rt container_file_t /opt/kiro-rs/config
```

---

## 7. Firewall

Nếu mở trực tiếp port 8990:

```bash
sudo firewall-cmd --permanent --add-port=8990/tcp
sudo firewall-cmd --reload
```

Khuyến nghị production:

- Bind port ra localhost: `127.0.0.1:8990:8990`
- Đặt Nginx/Caddy phía trước để có HTTPS
- Không mở Admin UI công khai nếu không cần

Sửa `docker-compose.yml`:

```yaml
ports:
  - "127.0.0.1:8990:8990"
```

Sau đó:

```bash
sudo docker compose up -d
```

---

## 8. Cập nhật phiên bản mới

Khi GitHub Actions build xong image mới:

```bash
cd /opt/kiro-rs
sudo docker compose pull
sudo docker compose up -d
```

Xem log:

```bash
sudo docker compose logs -f --tail=100 kiro-rs
```

---

## 9. Dọn dung lượng trên VPS

Vì VPS chỉ pull image, không build, dung lượng thường rất nhỏ. Khi cần dọn:

```bash
sudo docker system df
sudo docker image prune -af
sudo docker builder prune -af
```

Không chạy `docker system prune -a --volumes` nếu chưa kiểm tra, tránh xóa volume dữ liệu.

---

## 10. Build image trên GitHub

Workflow tự chạy khi:

- Push lên nhánh `master`
- Push tag `v*`
- Hoặc vào **Actions → Build and Push Docker Image → Run workflow**

Image được push với các tag:

```text
ghcr.io/nv876620-design/kiro-rs:latest
ghcr.io/nv876620-design/kiro-rs:sha-<commit>
ghcr.io/nv876620-design/kiro-rs:vX.Y.Z   # nếu push tag vX.Y.Z
```

Theo dõi build:

```bash
gh run list --workflow=docker-build.yaml
gh run watch
```
