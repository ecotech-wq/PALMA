import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Logique métier pure : pas de DOM, environnement node.
    environment: "node",
  },
  resolve: {
    alias: {
      // Même alias que tsconfig.json ("@/*" -> "./src/*") pour que les
      // tests puissent importer les modules du projet.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
