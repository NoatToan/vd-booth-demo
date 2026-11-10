#!/bin/bash
# Installs an hourly launchd agent that runs pull.mjs until every job is done (pull.mjs then removes the agent).
#   bash scripts/figma-pull/install-agent.sh      log: ~/Library/Logs/vd-booth-figma-pull.log
set -e
LABEL=com.noattoan.vd-booth-figma-pull
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
cat > "$PLIST" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/opt/homebrew/bin/node</string><string>$ROOT/scripts/figma-pull/pull.mjs</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/vd-booth-figma-pull.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/vd-booth-figma-pull.log</string>
</dict></plist>
P
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "installed $PLIST"
