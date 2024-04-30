#!/bin/bash
# Start dev server for BoxSmith
# Access at: http://localhost:8080/BoxSmith/ui/

cd "$(dirname "$0")/.."
lsof -ti :8080 | xargs kill 2>/dev/null
echo "Starting server at http://localhost:8080/BoxSmith/ui/"
python3 -m http.server 8080
