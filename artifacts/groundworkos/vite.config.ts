import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ command, isPreview }) => {
  const needsPort = command === "serve" || isPreview;

  let port: number | undefined;

  if (needsPort) {
    const rawPort = process.env.PORT;

    if (!rawPort) {
      throw new Error(
        "PORT environment variable is required but was not provided.",
      );
    }

    port = Number(rawPort);

    if (Number.isNaN(port) || port <= 0) {
      throw new Error(`Invalid PORT value: "${rawPort}"`);
    }
  }

  let basePath = process.env.BASE_PATH;

  if (!basePath) {
    console.warn(
      'BASE_PATH environment variable was not provided; defaulting to "/".',
    );
    basePath = "/";
  }

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss({ optimize: false }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
      },
      dedupe: ["react", "react-dom"],
    },
    root: path.resolve(import.meta.dirname),
    build: {
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
