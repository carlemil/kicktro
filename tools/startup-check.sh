#!/usr/bin/env bash
# STARTUP-TIME GATE. Loads the built page headless and fails if the FIRST frame takes longer
# than a budget of real seconds to arrive.
#
#   tools/startup-check.sh [dev-index.html] [budget-seconds=20]
#
# Why this exists, and why it is wall-clock: v1.37.0 shipped a shader that the driver took
# 64 seconds to link, synchronously, at boot. The page looked hung. No probe caught it --
# there is no error, the DOM is fine -- and neither did the browser checks, because
# --virtual-time-budget waits through a stall: against that build the frame counter read
# "17 frames, 45 fps" and every assertion passed. The only thing a synchronous hang cannot
# fool is the clock on the wall, so that is what this measures. It runs the real GPU on
# purpose (no SwiftShader flags): the bug was in the driver's backend.
set -u
FILE="${1:-dev-index.html}"
BUDGET="${2:-20}"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
ABS="$(cd "$(dirname "$FILE")" && pwd -W 2>/dev/null || pwd)/$(basename "$FILE")"
UD="$(mktemp -d)"
start=$(date +%s)
# --virtual-time-budget small on purpose: a healthy page reaches its first frame inside it,
# and a hung one holds the process until the link finishes regardless.
# Since Edge 156 msedge.exe hands off and returns AT ONCE (this read "0s wall" while the
# browser was still booting), so PowerShell's Start-Process -Wait, which waits for the whole
# process tree, does the waiting.
UDW="$(cygpath -w "$UD")"
timeout $((BUDGET + 60)) powershell.exe -NoProfile -Command \
  "Start-Process -FilePath '$(cygpath -w "$EDGE")' -NoNewWindow -Wait -ArgumentList @('--headless=new','--disable-extensions','--virtual-time-budget=3000','--window-size=640,400','--user-data-dir=$UDW','file:///$ABS')" \
  >/dev/null 2>&1
elapsed=$(( $(date +%s) - start ))
rm -rf "$UD"
if [ "$elapsed" -gt "$BUDGET" ]; then
  echo "FAIL  startup took ${elapsed}s of wall time (budget ${BUDGET}s) -- something is blocking boot"
  exit 1
fi
echo "PASS  startup ${elapsed}s wall (budget ${BUDGET}s)"
