import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { environment: "node" },
})
git fetch origin
git switch -c feature/frontend-redesign
git add .
git commit -m "Initial commit from downloaded repository"
git push -u origin feature/frontend-redesign