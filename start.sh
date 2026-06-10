#!/bin/bash
echo "Starting secondmind..."

# Backend
cd "$(dirname "$0")/backend"
source venv/bin/activate
uvicorn main:app --reload &
BACKEND_PID=$!

# Frontend
cd "$(dirname "$0")/frontend"
npm run dev &
FRONTEND_PID=$!

# Open browser after a short wait
sleep 4
if command -v xdg-open &> /dev/null; then
  xdg-open http://localhost:5173      # Linux
elif command -v open &> /dev/null; then
  open http://localhost:5173          # macOS
fi

# Keep script alive; Ctrl+C shuts everything down
trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait
