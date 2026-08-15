[CmdletBinding()]
param(
  [switch]$PrintTarget,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$OrcaArguments
)

$ErrorActionPreference = 'Stop'
$fullVersionRoot = Join-Path $PSScriptRoot 'FullVersion'

if (-not (Test-Path -LiteralPath $fullVersionRoot -PathType Container)) {
  throw "FullVersion directory was not found: $fullVersionRoot"
}

$candidates = @(
  Get-ChildItem -LiteralPath $fullVersionRoot -Directory -Force | ForEach-Object {
    if ($_.Name -notmatch '^OrcaPresetAssistant-Orca-(?<version>\d+\.\d+\.\d+(?:\.\d+)?)-Windows-x64$') {
      return
    }

    $versionText = $Matches.version
    $executable = Join-Path $_.FullName 'orca-slicer.exe'
    $helper = Join-Path $_.FullName 'resources\helper\Orca Preset Assistant.exe'
    $nativeDll = Join-Path $_.FullName 'OrcaSlicer.dll'
    $helperAsar = Join-Path $_.FullName 'resources\helper\resources\app.asar'
    if (-not (Test-Path -LiteralPath $executable -PathType Leaf) -or
        -not (Test-Path -LiteralPath $helper -PathType Leaf) -or
        -not (Test-Path -LiteralPath $nativeDll -PathType Leaf) -or
        -not (Test-Path -LiteralPath $helperAsar -PathType Leaf)) {
      return
    }

    $verified = $false
    $manifestPath = Join-Path $_.FullName 'preset-assistant-build.json'
    if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
      try {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
        if ($manifest.schemaVersion -ne 1 -or
            $manifest.displayVersion -ne $versionText -or
            $manifest.readyForDesktopShortcut -ne $true -or
            $manifest.capabilities.nativePresetHotReload -ne $true -or
            $manifest.capabilities.nativePresetHotUnload -ne $true -or
            $manifest.capabilities.presetFileChangeInbox -ne $true) {
          return
        }

        $nativeHash = (Get-FileHash -LiteralPath $nativeDll -Algorithm SHA256).Hash
        $helperHash = (Get-FileHash -LiteralPath $helperAsar -Algorithm SHA256).Hash
        if ($nativeHash -ne $manifest.nativeDllSha256 -or
            $helperHash -ne $manifest.helperAppAsarSha256) {
          return
        }
        $verified = $true
      } catch {
        return
      }
    }

    [PSCustomObject]@{
      Version = [version]$versionText
      Verified = $verified
      Directory = $_.FullName
      Executable = $executable
      LastWriteTimeUtc = $_.LastWriteTimeUtc
    }
  }
)

$selected = $candidates |
  Sort-Object -Property @{ Expression = 'Verified'; Descending = $true },
    @{ Expression = 'Version'; Descending = $true },
    @{ Expression = 'LastWriteTimeUtc'; Descending = $true } |
  Select-Object -First 1

if ($null -eq $selected) {
  throw "No complete Orca Preset Assistant build was found under: $fullVersionRoot"
}

if ($PrintTarget) {
  $selected.Executable
  exit 0
}

$startParameters = @{
  FilePath = $selected.Executable
  WorkingDirectory = $selected.Directory
}
if ($OrcaArguments.Count -gt 0) {
  $startParameters.ArgumentList = $OrcaArguments
}

Start-Process @startParameters
