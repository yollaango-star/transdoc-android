#!/bin/bash
# Installe les outils IA (claude-mem, OmniRoute, Headroom) dans les sessions Claude Code on the web.
set -euo pipefail

# Uniquement dans l'environnement distant (claude.ai/code)
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

export PATH="$HOME/.local/bin:$PATH"

# --- claude-mem (plugin Claude Code) ---
# Déclaré aussi dans .claude/settings.json ; ceci garantit l'installation au niveau utilisateur.
if ! claude plugin list 2>/dev/null | grep -q 'claude-mem@thedotmack'; then
  claude plugin marketplace add thedotmack/claude-mem >&2 || true
  claude plugin install claude-mem@thedotmack >&2 || echo "claude-mem: installation échouée" >&2
fi

# --- OmniRoute (passerelle IA, CLI npm) ---
if ! command -v omniroute >/dev/null 2>&1; then
  npm install -g omniroute >&2 || echo "omniroute: installation échouée" >&2
fi

# --- Headroom (compression de contexte, CLI Python) ---
if ! command -v headroom >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then
    uv tool install "headroom-ai[proxy]" >&2 || echo "headroom: installation échouée" >&2
  else
    pip install --user "headroom-ai[proxy]" >&2 || echo "headroom: installation échouée" >&2
  fi
fi

# Rendre ~/.local/bin (headroom) disponible pour la session
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi

exit 0
