#!/usr/bin/env bash
# ==============================================================================
# Campus E-Voting System (CEVS) - Linux Kiosk Launcher
# Target: Ubuntu 26.04 LTS (GNOME Wayland / Snap Firefox / evote user)
# ==============================================================================
set -euo pipefail

# ------------------------------------------------------------------------------
# Configuration & Environment
# ------------------------------------------------------------------------------
# Source system-wide or user-level overrides if available
if [[ -f "/etc/default/evote-kiosk" ]]; then
    # shellcheck disable=SC1091
    source "/etc/default/evote-kiosk"
elif [[ -f "${HOME}/.config/evote/kiosk.env" ]]; then
    # shellcheck disable=SC1091
    source "${HOME}/.config/evote/kiosk.env"
fi

# Fallback Voting URL if not configured via environment
VOTING_URL="${VOTING_URL:-http://localhost:3000/kiosk/vote}"

# Wayland display enforcement
export MOZ_ENABLE_WAYLAND=1
export GDK_BACKEND=wayland
export XDG_CURRENT_DESKTOP="GNOME"
export NO_AT_BRIDGE=1

# Process management variables
FIREFOX_PID=""
SHUTDOWN_REQUESTED=0

# Crash loop threshold constants
MIN_RUN_DURATION_SEC=15   # Runs longer than this are considered healthy
BASE_COOLDOWN_SEC=3       # Initial cooldown upon unexpected exit
MAX_COOLDOWN_SEC=30       # Maximum cooldown during persistent crash loop
RAPID_CRASH_LIMIT=5       # Successive rapid crashes before extended backoff

RAPID_CRASH_COUNT=0

# ------------------------------------------------------------------------------
# Logging Helpers
# ------------------------------------------------------------------------------
log_info() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] [PID $$] $*"
}

log_warn() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] [PID $$] $*" >&2
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] [PID $$] $*" >&2
}

# ------------------------------------------------------------------------------
# Signal Handling & Clean Shutdown
# ------------------------------------------------------------------------------
cleanup() {
    SHUTDOWN_REQUESTED=1
    log_info "Termination signal received. Shutting down kiosk browser..."
    
    if [[ -n "${FIREFOX_PID}" ]] && kill -0 "${FIREFOX_PID}" 2>/dev/null; then
        log_info "Sending SIGTERM to Firefox (PID: ${FIREFOX_PID})..."
        kill -SIGTERM "${FIREFOX_PID}" 2>/dev/null || true
        
        # Wait up to 5 seconds for graceful shutdown
        local wait_counter=0
        while kill -0 "${FIREFOX_PID}" 2>/dev/null && [[ ${wait_counter} -lt 10 ]]; do
            sleep 0.5
            wait_counter=$((wait_counter + 1))
        done
        
        # Force kill if still hanging
        if kill -0 "${FIREFOX_PID}" 2>/dev/null; then
            log_warn "Firefox did not terminate gracefully. Sending SIGKILL..."
            kill -SIGKILL "${FIREFOX_PID}" 2>/dev/null || true
        fi
    fi
    
    # Remove any stale lock files before exiting
    clean_stale_locks
    log_info "Kiosk launcher shutdown complete."
    exit 0
}

trap cleanup SIGINT SIGTERM SIGHUP

# ------------------------------------------------------------------------------
# Browser Profile & Lock Cleanup
# ------------------------------------------------------------------------------
clean_stale_locks() {
    local snap_firefox_dir="${HOME}/snap/firefox/common/.mozilla/firefox"
    local std_firefox_dir="${HOME}/.mozilla/firefox"
    
    for base_dir in "${snap_firefox_dir}" "${std_firefox_dir}"; do
        if [[ -d "${base_dir}" ]]; then
            find "${base_dir}" -maxdepth 3 -type f \( \
                -name ".parentlock" -o \
                -name "lock" -o \
                -name "sessionstore.jsonlz4" -o \
                -name "sessionstore.bak*" \
            \) -delete 2>/dev/null || true
        fi
    done
}

# ------------------------------------------------------------------------------
# Firefox Binary Discovery
# ------------------------------------------------------------------------------
resolve_firefox_cmd() {
    if command -v snap >/dev/null 2>&1 && snap list firefox >/dev/null 2>&1; then
        echo "snap run firefox"
    elif [[ -x "/snap/bin/firefox" ]]; then
        echo "/snap/bin/firefox"
    elif command -v firefox >/dev/null 2>&1; then
        echo "firefox"
    else
        log_error "Firefox executable could not be found! Ensure snap firefox is installed."
        exit 1
    fi
}

FIREFOX_BIN=$(resolve_firefox_cmd)
log_info "Using Firefox binary: ${FIREFOX_BIN}"
log_info "Kiosk target URL: ${VOTING_URL}"

# ------------------------------------------------------------------------------
# Main Kiosk Watchdog Loop
# ------------------------------------------------------------------------------
while [[ ${SHUTDOWN_REQUESTED} -eq 0 ]]; do
    clean_stale_locks
    
    LAUNCH_START_TIME=$(date +%s)
    log_info "Launching Firefox in kiosk mode..."
    
    # Launch Firefox in kiosk mode with strict parameters
    # -kiosk: Fullscreen, no window chrome, no navigation bar
    # -private-window: Ephemeral browsing session
    # --url: Direct destination
    ${FIREFOX_BIN} \
        --kiosk \
        --private-window \
        --url "${VOTING_URL}" &
    
    FIREFOX_PID=$!
    log_info "Firefox started with PID: ${FIREFOX_PID}"
    
    # Wait for the browser process to exit or be signaled
    wait "${FIREFOX_PID}" || true
    EXIT_CODE=$?
    LAUNCH_END_TIME=$(date +%s)
    RUN_DURATION=$((LAUNCH_END_TIME - LAUNCH_START_TIME))
    FIREFOX_PID=""
    
    if [[ ${SHUTDOWN_REQUESTED} -eq 1 ]]; then
        break
    fi
    
    log_warn "Firefox process exited with code ${EXIT_CODE} after ${RUN_DURATION} seconds."
    
    # Crash throttle detection
    if [[ ${RUN_DURATION} -lt ${MIN_RUN_DURATION_SEC} ]]; then
        RAPID_CRASH_COUNT=$((RAPID_CRASH_COUNT + 1))
        log_warn "Rapid crash detected (${RAPID_CRASH_COUNT}/${RAPID_CRASH_LIMIT})."
    else
        if [[ ${RAPID_CRASH_COUNT} -gt 0 ]]; then
            log_info "Stable run observed (${RUN_DURATION}s). Resetting crash counter."
        fi
        RAPID_CRASH_COUNT=0
    fi
    
    # Calculate backoff delay
    if [[ ${RAPID_CRASH_COUNT} -ge ${RAPID_CRASH_LIMIT} ]]; then
        COOLDOWN=${MAX_COOLDOWN_SEC}
        log_error "Excessive crash threshold reached! Applying max cooldown of ${COOLDOWN}s before restart."
    elif [[ ${RAPID_CRASH_COUNT} -gt 1 ]]; then
        COOLDOWN=$((BASE_COOLDOWN_SEC * RAPID_CRASH_COUNT))
        if [[ ${COOLDOWN} -gt ${MAX_COOLDOWN_SEC} ]]; then
            COOLDOWN=${MAX_COOLDOWN_SEC}
        fi
        log_warn "Applying progressive crash backoff cooldown: ${COOLDOWN}s."
    else
        COOLDOWN=${BASE_COOLDOWN_SEC}
    fi
    
    log_info "Restarting kiosk browser in ${COOLDOWN} seconds..."
    sleep "${COOLDOWN}"
done

log_info "Kiosk watchdog loop ended cleanly."
exit 0
