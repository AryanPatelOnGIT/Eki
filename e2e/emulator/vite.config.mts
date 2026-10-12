import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/postcss';
const local = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({
  root: local('.'), server: { host: '127.0.0.1', port: 3115, strictPort: true },
  resolve: { alias: [
    ...['@/lib/firebaseCore', '@/lib/firebaseAuth', '@/lib/firebaseFirestore', '@/lib/firebaseDatabase', './firebaseCore', './firebaseAuth', './firebaseFirestore', './firebaseDatabase'].map(find => ({ find, replacement: local('firebase.ts') })),
    { find: '@vis.gl/react-google-maps', replacement: local('../fixtures/map-adapter.tsx') },
    { find: '@/components/maps/DirectionsRoute', replacement: local('../fixtures/map-adapter.tsx') },
    { find: 'next/dynamic', replacement: local('../fixtures/dynamic.tsx') },
    ...['next/navigation', 'next/link'].map(find => ({ find, replacement: local('../admin-access/adapters.tsx') })),
    { find: '@', replacement: local('../../frontend/src') },
  ] }, css: { postcss: { plugins: [tailwindcss()] } }, oxc: { jsx: { runtime: 'automatic' } },
  define: { 'process.env': JSON.stringify({ NODE_ENV: 'development', NEXT_PUBLIC_FIREBASE_APPCHECK_DISABLED: 'true', NEXT_PUBLIC_BACKEND_URL: 'http://127.0.0.1:3116' }) },
});
