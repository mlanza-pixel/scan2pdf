param([Parameter(Mandatory=$true)][string]$ZipPath,[string]$RepoUrl='https://github.com/mlanza-pixel/scan2pdf.git',[string]$Branch='main')
$ErrorActionPreference='Stop'
$work=Join-Path $env:TEMP ('docuscan_publish_'+[guid]::NewGuid().ToString('N'))
$extract=Join-Path $work 'extract';$repo=Join-Path $work 'repo'
try {
 New-Item -ItemType Directory -Path $extract -Force | Out-Null
 if (-not (Test-Path -LiteralPath $ZipPath)) {throw "ZIP not found: $ZipPath"}
 Expand-Archive -LiteralPath $ZipPath -DestinationPath $extract -Force
 $app=Get-ChildItem -LiteralPath $extract -Recurse -Filter index.html -File | Where-Object {$_.FullName -notmatch '[\\/]node_modules[\\/]'} | Sort-Object {$_.FullName.Length} | Select-Object -First 1
 if (-not $app) {throw 'ZIP has no application index.html'}
 $appRoot=$app.Directory.FullName
 if (-not (Test-Path (Join-Path $appRoot '.github/workflows/automated-tests.yml'))) {throw 'Missing GitHub Actions workflow in ZIP'}
 if (-not (Test-Path (Join-Path $appRoot 'scripts'))) {throw 'Missing testing scripts in ZIP'}
 if (-not (Test-Path (Join-Path $appRoot 'docs'))) {throw 'Missing docs in ZIP'}
 Write-Host "Application root: $appRoot"
 & git clone --branch $Branch --single-branch $RepoUrl $repo
 if ($LASTEXITCODE -ne 0) {throw 'Git clone failed'}
 # Remove previously tracked application files, while preserving all existing GitHub workflows and Git metadata.
 Push-Location $repo
 try {
  $tracked = & git ls-files -z
  if ($LASTEXITCODE -ne 0) {throw 'Cannot enumerate tracked files'}
  foreach ($rel in ($tracked -split "`0")) {
   if (-not $rel) {continue}
   $normalized=$rel.Replace('\\','/')
   if ($normalized.StartsWith('.github/')) {continue}
   $full=Join-Path $repo ($rel.Replace('/',[IO.Path]::DirectorySeparatorChar))
   if (Test-Path -LiteralPath $full -PathType Leaf) {Remove-Item -LiteralPath $full -Force}
  }
  # Copy entire release (including docs, scripts, fixtures and .github), excluding generated and secret files.
  $excludeDirs=@('.git','node_modules','__pycache__','.venv','venv','.pytest_cache','test-results','playwright-report')
  $excludeFiles=@('.env','.env.local','.env.production')
  Get-ChildItem -LiteralPath $appRoot -Force | Where-Object {$_.Name -notin $excludeDirs -and $_.Name -notin $excludeFiles} | ForEach-Object {
   $destination=Join-Path $repo $_.Name
   if ($_.PSIsContainer) {
    & robocopy $_.FullName $destination /E /R:2 /W:1 /XD $excludeDirs /XF $excludeFiles | Out-Null
    if ($LASTEXITCODE -ge 8) {throw "Copy failed: $($_.Name)"}
   } else {Copy-Item -LiteralPath $_.FullName -Destination $destination -Force}
  }
  & git add -A
  if ($LASTEXITCODE -ne 0) {throw 'git add failed'}
  Write-Host '--- Changes to publish ---'
  & git status --short
  & git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {Write-Host 'No changes: repository already matches this release.';exit 0}
  $version='7.7.0'
  try {$release=Get-Content -LiteralPath (Join-Path $appRoot 'release.json') -Raw | ConvertFrom-Json; if ($release.version) {$version=$release.version}} catch {}
  & git -c 'user.name=mlanza-pixel' -c 'user.email=henrymottola@gmail.com' commit -m "Publish DocuScan Pro v$version (app, docs, tests and workflows)"
  if ($LASTEXITCODE -ne 0) {throw 'Commit failed'}
  & git push origin $Branch
  if ($LASTEXITCODE -ne 0) {throw 'Push failed. No force push attempted.'}
  & git fetch origin $Branch | Out-Null
  $local=(& git rev-parse HEAD).Trim();$remote=(& git rev-parse "origin/$Branch").Trim()
  if ($local -ne $remote) {throw 'Push verification failed: remote differs'}
  Write-Host "SUCCESS: $remote"
  Write-Host 'GitHub Actions will run on push; review the Actions tab for actual results.'
 } finally {Pop-Location}
} catch {Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red;exit 1}
finally {if (Test-Path $work) {Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue}}
