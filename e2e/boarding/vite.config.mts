import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/postcss";
const local = (name: string) => fileURLToPath(new URL(name, import.meta.url));
export default defineConfig({
  root: local("."),
  server: { host: "127.0.0.1", port: 3200, strictPort: true },
  resolve: { alias: [
    { find: "@/lib/firebaseAuth", replacement: local("auth.ts") },
    { find: "@/lib/authState", replacement: local("auth.ts") },
    { find: "@", replacement: local("../../frontend/src") },
  ] },
  css: { postcss: { plugins: [tailwindcss()] } },
  define: { "process.env": JSON.stringify({ NEXT_PUBLIC_BACKEND_URL: "http://127.0.0.1:3200" }) },
  oxc: { jsx: { runtime: "automatic" } },
});
