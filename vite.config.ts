import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // @wavoip/wavoip-api TEM que ficar no include — ele depende de `debug`
    // (CommonJS) que precisa ser convertido pra ESM pelo esbuild.
    //
    // Efeito colateral: o esbuild reescreve `new URL("data:text/javascript;
    // base64,...", import.meta.url)` (usado pelos AudioWorklet processors do SDK
    // nas linhas 577/598 de dist/index.es.js) como asset reference, corrompendo
    // o data URL pra `/node_modules/.vite/deps/data:...`.
    //
    // Workaround: monkey-patch em src/lib/wavoip-init.ts intercepta addModule
    // e reconstroi o blob URL a partir do base64 embutido.
    include: ['@wavoip/wavoip-api', 'grapesjs', 'reactflow'],
  },
  build: {
    target: "esnext",
    commonjsOptions: {
      // Permitir importação de módulos ESM
      transformMixedEsModules: true,
    },
    // Usar terser ao invés de esbuild para evitar corrupção de strings longas (JWT keys)
    minify: 'terser',
    terserOptions: {
      format: {
        // Não inserir quebras de linha baseadas em comprimento máximo
        max_line_len: false,
      },
    },
  },
}));
