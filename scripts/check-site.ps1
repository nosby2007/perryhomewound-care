$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$publicRoot = Join-Path $projectRoot "public"
$failures = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()

Write-Host "Checking JSON configuration..."
foreach ($jsonFile in @("firebase.json", "database.rules.json", "firestore.indexes.json")) {
  $path = Join-Path $projectRoot $jsonFile
  try {
    Get-Content -LiteralPath $path -Raw | ConvertFrom-Json | Out-Null
  } catch {
    $failures.Add("$jsonFile is not valid JSON: $($_.Exception.Message)")
  }
}

Write-Host "Checking JavaScript module syntax..."
$jsFiles = Get-ChildItem -LiteralPath $publicRoot -Recurse -File -Filter "*.js"
foreach ($file in $jsFiles) {
  $source = Get-Content -LiteralPath $file.FullName -Raw
  $source | & node --input-type=module --check 2>$null
  if ($LASTEXITCODE -ne 0) {
    $relative = $file.FullName.Substring($projectRoot.Length + 1)
    $failures.Add("JavaScript syntax failed: $relative")
  }
}

function Test-PublicReference([string]$target) {
  if (Test-Path -LiteralPath $target) {
    return $true
  }

  # Firebase Hosting uses cleanUrls=true. A route such as /blog resolves
  # public/blog.html and /folder/page resolves public/folder/page.html.
  if ([string]::IsNullOrWhiteSpace([System.IO.Path]::GetExtension($target))) {
    if (Test-Path -LiteralPath ($target + ".html")) {
      return $true
    }
    $indexPath = Join-Path $target "index.html"
    if (Test-Path -LiteralPath $indexPath) {
      return $true
    }
  }

  return $false
}

Write-Host "Checking HTML document structure and local references..."
$htmlFiles = Get-ChildItem -LiteralPath $publicRoot -Recurse -File -Filter "*.html"
foreach ($file in $htmlFiles) {
  $text = Get-Content -LiteralPath $file.FullName -Raw
  $relative = $file.FullName.Substring($publicRoot.Length + 1)

  if ([string]::IsNullOrWhiteSpace($text)) {
    $warnings.Add("Empty placeholder page: $relative")
    continue
  }

  if ([regex]::Matches($text, "<!doctype", "IgnoreCase").Count -ne 1) {
    $failures.Add("Expected one doctype: $relative")
  }
  if ([regex]::Matches($text, "<html(?:\s|>)", "IgnoreCase").Count -ne 1) {
    $failures.Add("Expected one html root: $relative")
  }

  $references = [regex]::Matches(
    $text,
    "(?i)(?:href|src)\s*=\s*[""']([^""'#]+)[""']"
  )
  foreach ($match in $references) {
    $reference = $match.Groups[1].Value
    if ($reference -match "^(https?:|mailto:|tel:|data:|javascript:|//|\{)") {
      continue
    }

    $clean = ($reference -split "[?#]")[0]
    if ([string]::IsNullOrWhiteSpace($clean)) {
      continue
    }

    if ($clean.StartsWith("/")) {
      $target = Join-Path $publicRoot $clean.TrimStart("/")
    } else {
      $target = Join-Path $file.DirectoryName $clean
    }

    if (-not (Test-PublicReference $target)) {
      $failures.Add("Broken local reference in ${relative}: $reference")
    }
  }
}

foreach ($warning in $warnings | Sort-Object -Unique) {
  Write-Warning $warning
}

if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "Site checks failed:" -ForegroundColor Red
  foreach ($failure in $failures | Sort-Object -Unique) {
    Write-Host " - $failure" -ForegroundColor Red
  }
  exit 1
}

Write-Host "All site checks passed." -ForegroundColor Green
