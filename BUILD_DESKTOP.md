# Kiro Desktop - Build Scripts

Các script để build và chạy kiro desktop app trên Windows.

## Yêu cầu

- Node.js (v18+)
- pnpm (`npm install -g pnpm`)
- Rust/Cargo (https://rustup.rs/)
- Tauri CLI (cho build installer): `cargo install tauri-cli`

## Scripts

### 1. `run-desktop-dev.bat` - Chạy ở Dev Mode

Chạy desktop app để test trong quá trình phát triển:

```bash
.\run-desktop-dev.bat
```

- Build frontend
- Chạy app với cargo run (debug mode)
- App sẽ mở ở `http://127.0.0.1:8080/admin`

### 2. `build-desktop-quick.bat` - Build Nhanh (Debug)

Build nhanh để test, không tối ưu hóa:

```bash
.\build-desktop-quick.bat
```

- Build frontend
- Build app ở debug mode (nhanh hơn)
- Output: `src-tauri\target\debug\kiro-rs-desktop.exe`

### 3. `build-desktop-release.bat` - Build Release

Build app đã tối ưu hóa (để sử dụng):

```bash
.\build-desktop-release.bat
```

- Build frontend
- Build app ở release mode với native-tls
- Output: `src-tauri\target\release\kiro-rs-desktop.exe`
- File exe có thể chạy độc lập

### 4. `build-desktop-installer.bat` - Build Installer

Tạo installer MSI/NSIS để phát hành:

```bash
.\build-desktop-installer.bat
```

- Build frontend
- Build installer với Tauri
- Output:
  - `src-tauri\target\release\bundle\msi\*.msi`
  - `src-tauri\target\release\bundle\nsis\*.exe`

## Lưu ý

- Lần build đầu tiên sẽ mất nhiều thời gian (5-10 phút) để download dependencies
- Build release và installer tốn nhiều thời gian hơn debug build
- Port mặc định: 8080 (có thể thay đổi trong config.json nếu bị xung đột)

## Troubleshooting

### Frontend build failed
```bash
cd admin-ui
pnpm install
pnpm run build
```

### Cargo build failed
```bash
# Cập nhật Rust
rustup update

# Clear cache và rebuild
cargo clean
cargo build
```

### Tauri CLI not found
```bash
cargo install tauri-cli
```
