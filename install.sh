#!/usr/bin/env bash
# Enterprise Certification Framework - Skill Installer (macOS / Linux / Git Bash)
# Copies all 7 skills and the shared/ reference docs to ~/.claude/skills/ for global availability in Claude Code

set -u

SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SKILLS=(
  discover-app
  test-data-generator
  application-certification
  migration-certification
  production-readiness-review
  generate-jira-bugs
  generate-pdf-report
)

echo ""
echo "Enterprise Certification Framework - Installer"
echo "================================================"
echo "Source:      $SOURCE_DIR"
echo "Destination: $SKILLS_DIR"
echo ""

mkdir -p "$SKILLS_DIR"

installed=0
failed=0

for skill in "${SKILLS[@]}" shared; do
  src="$SOURCE_DIR/$skill"
  dest="$SKILLS_DIR/$skill"
  if [ ! -d "$src" ]; then
    echo "  SKIP  $skill - source not found: $src"
    failed=$((failed + 1))
    continue
  fi
  rm -rf "$dest" && cp -R "$src" "$dest" || { echo "  FAIL  $skill"; failed=$((failed + 1)); continue; }
  if [ "$skill" = "shared" ]; then
    echo "  OK    shared/ (reference docs)"
  elif [ -f "$dest/SKILL.md" ]; then
    echo "  OK    /$skill"
    installed=$((installed + 1))
  else
    echo "  WARN  /$skill - SKILL.md missing after copy"
    failed=$((failed + 1))
  fi
done

# Prerequisite check: paysec browse binary
if [ ! -x "$SKILLS_DIR/paysec/browser/dist/browse" ] && [ ! -x "$SKILLS_DIR/paysec/browser/dist/browse.exe" ]; then
  echo ""
  echo "  WARN  paysec browse binary not found under $SKILLS_DIR/paysec/browser/dist/"
  echo "        The skills need it to drive the browser. See README -> Prerequisites."
fi

echo ""
echo "================================================"
if [ "$failed" -eq 0 ]; then
  echo "Installed: $installed/${#SKILLS[@]} skills"
  echo ""
  echo "Next steps:"
  echo "  1. Restart Claude Code (or run /reload)"
  echo "  2. Run: /application-certification url=https://your-app.com username=admin password=secret role=admin"
else
  echo "Installed: $installed/${#SKILLS[@]} | Failed: $failed"
  echo "Check errors above and re-run."
  exit 1
fi
echo ""
