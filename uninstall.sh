#!/bin/sh
# OpenPawl Uninstaller
# Usage: curl -fsSL https://raw.githubusercontent.com/nxank4/openpawl/main/uninstall.sh | sh
#
# Flags:
#   --yes          Skip confirmation prompts
#   --purge        Remove all data (config + memory) without asking
#   --no-color     Plain output for CI environments
#   --help         Show this help message
#
# POSIX sh compatible.

set -e

# --- Configuration ---
INSTALL_DIR="${HOME}/.openpawl"
BIN_DIR="${INSTALL_DIR}/bin"
SOURCE_DIR="${INSTALL_DIR}/source"

# --- Defaults ---
AUTO_YES=false
PURGE=false
NO_COLOR=false

# --- Parse arguments ---
while [ $# -gt 0 ]; do
    case "$1" in
        --yes|-y)
            AUTO_YES=true
            ;;
        --purge)
            PURGE=true
            AUTO_YES=true
            ;;
        --no-color)
            NO_COLOR=true
            ;;
        --help|-h)
            echo "OpenPawl Uninstaller"
            echo ""
            echo "Usage: sh uninstall.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --yes, -y      Skip confirmation prompts"
            echo "  --purge        Remove all data including config and memory"
            echo "  --no-color     Disable colored output"
            echo "  --help, -h     Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
    shift
done

# --- Color helpers ---
if [ "$NO_COLOR" = true ] || [ ! -t 1 ]; then
    GREEN=""
    RED=""
    YELLOW=""
    CYAN=""
    BOLD=""
    DIM=""
    RESET=""
else
    GREEN="\033[32m"
    RED="\033[31m"
    YELLOW="\033[33m"
    CYAN="\033[36m"
    BOLD="\033[1m"
    DIM="\033[2m"
    RESET="\033[0m"
fi

success() {
    printf "${GREEN}✓${RESET} %s\n" "$1"
}

warn() {
    printf "${YELLOW}!${RESET} %s\n" "$1"
}

info() {
    printf "${CYAN}>${RESET} %s\n" "$1"
}

# --- Prompt helper ---
ask_yes_no() {
    if [ "$AUTO_YES" = true ]; then
        return 0
    fi

    printf "%s [y/N] " "$1"
    read -r _answer </dev/tty 2>/dev/null || _answer="n"
    case "$_answer" in
        [yY]|[yY][eE][sS]) return 0 ;;
        *) return 1 ;;
    esac
}

# --- Remove binary ---
remove_binary() {
    if [ -x "${BIN_DIR}/openpawl" ]; then
        rm -f "${BIN_DIR}/openpawl"
        success "Removed ${BIN_DIR}/openpawl"
    else
        info "No binary found at ${BIN_DIR}/openpawl"
    fi

    # Also check for npm global install
    _npm_bin=""
    if command -v openpawl >/dev/null 2>&1; then
        _npm_bin=$(command -v openpawl 2>/dev/null)
        # Only remove if it's an npm global install (not our own bin)
        case "$_npm_bin" in
            */node_modules/*)
                warn "Found npm global install at ${_npm_bin}"
                warn "Remove with: npm uninstall -g @openpawl/cli"
                ;;
            "${BIN_DIR}/openpawl")
                # Already handled above
                ;;
            *)
                info "openpawl binary also found at: ${_npm_bin}"
                ;;
        esac
    fi
}

# --- Remove source ---
remove_source() {
    if [ -d "$SOURCE_DIR" ]; then
        rm -rf "$SOURCE_DIR"
        success "Removed source directory"
    fi
}

# --- Remove PATH entries ---
remove_path_entries() {
    _removed=false

    for _profile in \
        "${HOME}/.bashrc" \
        "${HOME}/.bash_profile" \
        "${HOME}/.zshrc" \
        "${HOME}/.profile"
    do
        if [ -f "$_profile" ] && grep -qF '.openpawl/bin' "$_profile" 2>/dev/null; then
            # Create temp file without openpawl PATH lines
            _tmp=$(mktemp)
            grep -v '.openpawl/bin' "$_profile" | grep -v '# OpenPawl' > "$_tmp" || true
            # Remove trailing blank lines that were left behind
            mv "$_tmp" "$_profile"
            success "Removed PATH entry from ~/${_profile##*/}"
            _removed=true
        fi
    done

    # Handle fish
    _fish_config="${HOME}/.config/fish/conf.d/openpawl.fish"
    if [ -f "$_fish_config" ]; then
        rm -f "$_fish_config"
        success "Removed fish config"
        _removed=true
    fi

    if [ "$_removed" = false ]; then
        info "No PATH entries found in shell profiles"
    fi
}

# --- Remove config ---
remove_config() {
    if [ -f "${INSTALL_DIR}/config.json" ]; then
        if [ "$PURGE" = true ] || ask_yes_no "  Remove config (~/.openpawl/config.json)?"; then
            rm -f "${INSTALL_DIR}/config.json"
            success "Removed config"
        else
            info "Kept config"
        fi
    fi
}

# --- Remove memory/data ---
remove_memory() {
    if [ -d "${INSTALL_DIR}/memory" ] || [ -d "${INSTALL_DIR}/data" ]; then
        if [ "$PURGE" = true ] || ask_yes_no "  Remove learned data (~/.openpawl/memory/)? This cannot be undone."; then
            rm -rf "${INSTALL_DIR}/memory" "${INSTALL_DIR}/data"
            success "Removed memory data"
        else
            info "Kept memory data"
        fi
    fi
}

# --- Cleanup empty dirs ---
cleanup_dirs() {
    # Remove bin dir if empty
    if [ -d "$BIN_DIR" ]; then
        rmdir "$BIN_DIR" 2>/dev/null || true
    fi

    # Remove install dir if empty
    if [ -d "$INSTALL_DIR" ]; then
        # Check if directory is empty (or only has empty subdirs)
        if [ -z "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
            rmdir "$INSTALL_DIR" 2>/dev/null || true
            success "Removed ~/.openpawl/ (empty)"
        else
            info "Kept ~/.openpawl/ (still has files)"
        fi
    fi
}

# --- Main ---
main() {
    printf "\n${BOLD}${CYAN}Uninstalling OpenPawl...${RESET}\n\n"

    # Confirm
    if [ "$AUTO_YES" = false ]; then
        if ! ask_yes_no "Remove OpenPawl from this system?"; then
            echo "Cancelled."
            exit 0
        fi
        echo ""
    fi

    remove_binary
    remove_source
    remove_path_entries

    echo ""

    remove_config
    remove_memory

    echo ""

    cleanup_dirs

    echo ""
    printf "${BOLD}${GREEN}OpenPawl has been uninstalled.${RESET}\n\n"
}

main
