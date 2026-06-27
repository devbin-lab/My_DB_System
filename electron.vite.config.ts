import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    // 프로덕션 렌더러 번들 미니파이(기본 off였음 → JS 약 절반으로 감소).
    build: { minify: 'esbuild' }
  }
})
