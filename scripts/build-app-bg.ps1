$Log = "D:\MCP\kiro.rs\build-app.log"
# PS 7.4+: native stderr must NOT become terminating errors; we read exit codes manually
$ErrorActionPreference = "Continue"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}
$Bundles = "nsis"
function Log($msg) {
    $line = "[$(Get-Date -Format 'HH:mm:ss')] $msg"
    $line | Out-File $Log -Append -Encoding utf8
    Write-Host $line
}
function Invoke-Step($cmd, $tag) {
    # merge stderr into stdout via 2>&1 *inside* Out-String so native stderr
    # text is treated as data, not as PS error records
    $out = Invoke-Expression "$cmd 2>&1" | Out-String
    $code = $LASTEXITCODE
    foreach ($line in ($out -split "`r?`n")) {
        if ($line.Trim() -ne "") { Log "[$tag] $line" }
    }
    return $code
}
Set-Location "D:\MCP\kiro.rs"
"BUILD START $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (frontend dist reused, tauri-cli preinstalled)" | Out-File $Log -Encoding utf8

$failed = $false
try {
    Log "STEP 1/2: check tauri CLI"
    $code = Invoke-Step "cargo tauri --version" "tauri"
    if ($code -ne 0) { throw "tauri CLI missing (exit $code)" }

    Log "STEP 2/2: cargo tauri build (bundles: $Bundles)"
    $code = Invoke-Step "cargo tauri build --bundles $Bundles -- --no-default-features --features native-tls" "tauri-build"
    if ($code -ne 0) { throw "cargo tauri build failed with exit $code" }

    Log "BUILD DONE"
    "RESULT=SUCCESS" | Out-File $Log -Append -Encoding utf8
} catch {
    $failed = $true
    Log "BUILD FAILED: $($_.Exception.Message)"
    "RESULT=FAIL" | Out-File $Log -Append -Encoding utf8
}
exit $(if ($failed) { 1 } else { 0 })


