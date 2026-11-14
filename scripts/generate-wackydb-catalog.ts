import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { buildWackyDbCatalog } from "../src/data/build-wackydb-catalog"

const sourcePath = fileURLToPath(new URL("../public/data/wackydb/", import.meta.url))
const catalogPath = fileURLToPath(
  new URL("../public/data/wackydb/catalog.json", import.meta.url),
)

const { catalog, itemCount, recipeCount, pieceCount } =
  await buildWackyDbCatalog(sourcePath)
await writeFile(catalogPath, `${JSON.stringify(catalog)}\n`, "utf8")

console.info(
  `Generated catalog: ${itemCount} items, ${recipeCount} recipes, ${pieceCount} pieces, ${catalog.diagnostics.length} diagnostics.`,
)