import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// HTTPS is opt-in via the HTTPS env var (used by `npm run dev:https`).
// getUserMedia (the camera) requires HTTPS when the iPad loads the kiosk over
// the LAN IP — but for local development/preview over localhost, plain HTTP is
// fine and keeps tooling happy.
const useHttps = process.env.HTTPS === 'true'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    host: true, // expose on the network so the iPad can reach the kiosk
  },
})
