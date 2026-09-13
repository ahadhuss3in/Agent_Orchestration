import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The API runs on 8000, this dev server on 5173. FastAPI has CORS enabled for
// 5173, so the browser is allowed to call it directly. If you ever change the
// frontend port, update the allow_origins list in
// services/Orchestration/main.py to match.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
})
