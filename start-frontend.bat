@echo off
cd frontend
if not exist node_modules npm install
echo Starting NexDeFi frontend at http://localhost:5173
npm run dev
