# Enterprise Certification Framework - Skill Installer
# Copies all 7 skills and the shared/ reference docs to ~/.claude/skills/ for global availability in Claude Code

$SkillsDir = "$env:USERPROFILE\.claude\skills"
$SourceDir = $PSScriptRoot

$Skills = @(
    "discover-app",
    "test-data-generator",
    "application-certification",
    "migration-certification",
    "production-readiness-review",
    "generate-jira-bugs",
    "generate-pdf-report"
)

Write-Host ""
Write-Host "Enterprise Certification Framework - Installer" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Source:      $SourceDir"
Write-Host "Destination: $SkillsDir"
Write-Host ""

# Ensure skills directory exists
if (-not (Test-Path $SkillsDir)) {
    New-Item -ItemType Directory -Force -Path $SkillsDir | Out-Null
    Write-Host "Created: $SkillsDir" -ForegroundColor Yellow
}

$Installed = 0
$Failed = 0

foreach ($Skill in $Skills) {
    $Src = Join-Path $SourceDir $Skill
    $Dest = Join-Path $SkillsDir $Skill

    if (-not (Test-Path $Src)) {
        Write-Host "  SKIP  $Skill - source not found: $Src" -ForegroundColor Yellow
        $Failed++
        continue
    }

    try {
        if (Test-Path $Dest) {
            Remove-Item -Recurse -Force $Dest -ErrorAction Stop
        }

        Copy-Item -Recurse -Path $Src -Destination $Dest -ErrorAction Stop

        $SkillMd = Join-Path $Dest "SKILL.md"
        if (Test-Path $SkillMd) {
            Write-Host "  OK    /$Skill" -ForegroundColor Green
            $Installed++
        } else {
            Write-Host "  WARN  /$Skill - SKILL.md missing after copy" -ForegroundColor Yellow
            $Failed++
        }
    } catch {
        Write-Host "  FAIL  /$Skill - $($_.Exception.Message)" -ForegroundColor Red
        $Failed++
    }
}

# Shared reference docs used by every skill (not a skill itself - no SKILL.md)
$SharedSrc = Join-Path $SourceDir "shared"
$SharedDest = Join-Path $SkillsDir "shared"
try {
    if (Test-Path $SharedDest) { Remove-Item -Recurse -Force $SharedDest -ErrorAction Stop }
    Copy-Item -Recurse -Path $SharedSrc -Destination $SharedDest -ErrorAction Stop
    Write-Host "  OK    shared/ (reference docs)" -ForegroundColor Green
} catch {
    Write-Host "  FAIL  shared/ - $($_.Exception.Message)" -ForegroundColor Red
    $Failed++
}

# Prerequisite check: paysec browse binary
$Browse = Join-Path $SkillsDir "paysec\browser\dist\browse.exe"
if (-not (Test-Path $Browse)) {
    Write-Host ""
    Write-Host "  WARN  paysec browse binary not found at $Browse" -ForegroundColor Yellow
    Write-Host "        The skills need it to drive the browser. See README -> Prerequisites." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan

if ($Failed -eq 0) {
    Write-Host "Installed: $Installed/$($Skills.Count) skills" -ForegroundColor Green
    Write-Host ""
    Write-Host "All skills installed successfully." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Restart Claude Code (or run /reload)"
    Write-Host "  2. Run: /application-certification url=https://your-app.com username=admin password=secret role=admin"
    Write-Host ""
    Write-Host "Available skills:"
    foreach ($Skill in $Skills) {
        Write-Host "  /$Skill"
    }
} else {
    Write-Host "Installed: $Installed/$($Skills.Count) | Failed: $Failed" -ForegroundColor Yellow
    Write-Host "Check errors above and re-run." -ForegroundColor Yellow
}

Write-Host ""
