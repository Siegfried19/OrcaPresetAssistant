param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\release')
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$packageJsonPath = Join-Path $repositoryRoot 'package.json'
$packageJson = Get-Content -Raw -Encoding utf8 -LiteralPath $packageJsonPath | ConvertFrom-Json
$resolvedOutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
$archivePath = Join-Path $resolvedOutputDirectory "OrcaPresetAssistant-Codex-Plugin-$($packageJson.version).zip"
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) "orca-preset-assistant-plugin-$([Guid]::NewGuid().ToString('N'))"
$stageRoot = Join-Path $temporaryRoot 'orca-preset-assistant-plugin'

try {
  New-Item -ItemType Directory -Force -Path (Join-Path $stageRoot '.agents\plugins') | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $stageRoot 'plugins') | Out-Null
  New-Item -ItemType Directory -Force -Path $resolvedOutputDirectory | Out-Null

  Copy-Item -LiteralPath (Join-Path $repositoryRoot 'packaging\codex-marketplace\marketplace.json') `
    -Destination (Join-Path $stageRoot '.agents\plugins\marketplace.json')
  Copy-Item -LiteralPath (Join-Path $repositoryRoot 'plugins\orca-preset-assistant') `
    -Destination (Join-Path $stageRoot 'plugins\orca-preset-assistant') -Recurse
  Copy-Item -LiteralPath (Join-Path $repositoryRoot 'docs\CODEX_PLUGIN.md') `
    -Destination (Join-Path $stageRoot 'README.md')
  Copy-Item -LiteralPath (Join-Path $repositoryRoot 'LICENSE') `
    -Destination (Join-Path $stageRoot 'LICENSE')

  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stageRoot,
    $archivePath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
  )

  Write-Output $archivePath
}
finally {
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}
