import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/postcss";

const local = (name: string) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  root: local("."),
  server: { host: "127.0.0.1", port: 3250, strictPort: true },
  resolve: { alias: [
    { find: "@/lib/firebaseAuth", replacement: local("auth.ts") },
    { find: "@/lib/firebaseFirestore", replacement: local("db.ts") },
    { find: "@/lib/authState", replacement: local("auth.ts") },
    { find: "@/lib/telemetryTrace", replacement: local("trace.ts") },
    { find: "firebase/firestore", replacement: local("firestore.ts") },
    { find: "@", replacement: local("../../frontend/src") },
  ] },
  css: { postcss: { plugins: [tailwindcss()] } },
  define: { "process.env": JSON.stringify({ NEXT_PUBLIC_BACKEND_URL: "http://127.0.0.1:3250" }) },
  oxc: { jsx: { runtime: "automatic" } },
});
