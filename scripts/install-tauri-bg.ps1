# 安装 tauri-cli v2（后台运行，日志写 tauri-install.log）
$ErrorActionPreference = "Continue"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}
$Log = "D:\MCP\kiro.rs\tauri-install.log"
"INSTALL START $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File $Log -Encoding utf8
$out = (cargo install tauri-cli --version "^2" --locked 2>&1) | Out-String
$code = $LASTEXITCODE
foreach ($line in ($out -split "`r?`n")) {
    if ($line.Trim() -ne "") { $line | Out-File $Log -Append -Encoding utf8 }
}
"INSTALL EXIT=$code" | Out-File $Log -Append -Encoding utf8
"RESULT=$(if ($code -eq 0) { 'SUCCESS' } else { 'FAIL' })" | Out-File $Log -Append -Encoding utf8
