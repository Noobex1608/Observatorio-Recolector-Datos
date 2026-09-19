#!/bin/bash
set -euo pipefail

# Install all project dependencies.
# Usage: ./scripts/install.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing Observatorio Forms Platform dependencies..."

"$SCRIPT_DIR/docker.sh" up
"$SCRIPT_DIR/backend.sh" install
"$SCRIPT_DIR/frontend.sh" install

echo "Dependencies installed."
echo "Next steps:"
echo "  ./scripts/backend.sh migrate"
echo "  ./scripts/start.sh all"
