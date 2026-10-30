#!/bin/bash
set -e

TARGET_URL="${KIOSK_TARGET_URL:-http://kiosk_test_frontend/kiosk}"

echo "[Kiosk Browser] Waiting for Kiosk Web App at ${TARGET_URL}..."

# Wait until web frontend responds
until curl -s -f "${TARGET_URL}" > /dev/null 2>&1; do
  echo "  Waiting for Kiosk frontend to be ready... retrying in 2 seconds."
  sleep 2
done

echo "[Kiosk Browser] Frontend is ready. Launching locked-down Linux kiosk browser in fullscreen..."

# Clean up any lingering chromium lock files or previous session profiles
rm -rf /root/.config/chromium /tmp/kiosk-profile
mkdir -p /tmp/kiosk-profile
touch "/tmp/kiosk-profile/First Run"

exec chromium-browser \
  --no-sandbox \
  --disable-gpu \
  --disable-software-rasterizer \
  --disable-dev-shm-usage \
  --kiosk \
  --start-fullscreen \
  --disable-infobars \
  --no-first-run \
  --no-default-browser-check \
  --disable-signin-promo \
  --disable-profile-picker \
  --disable-search-engine-choice-screen \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI,Sync,SignInProfileAvatarBubble,ProfilePicker,ProfilePickerOnStartup,InterestFeedContentSuggestions \
  --disable-sync \
  --incognito \
  --user-data-dir=/tmp/kiosk-profile \
  --password-store=basic \
  --disable-notifications \
  --disable-save-password-bubble \
  --disable-translate \
  --overscroll-history-navigation=0 \
  --check-for-update-interval=31536000 \
  --window-size=1920,1080 \
  --window-position=0,0 \
  "${TARGET_URL}"
