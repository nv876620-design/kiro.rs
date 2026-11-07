$ErrorActionPreference = "Continue"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}
$Log = "D:\MCP\kiro.rs\cargo-check.log"
Set-Location "D:\MCP\kiro.rs"
"CHECK START $(Get-Date -Format 'HH:mm:ss')" | Out-File $Log -Encoding utf8
$out = (cargo check --quiet 2>&1) | Out-String
$code = $LASTEXITCODE
if ($out.Trim() -ne "") { $out.Trim() | Out-File $Log -Append -Encoding utf8 }
"CHECK_EXIT=$code" | Out-File $Log -Append -Encoding utf8
