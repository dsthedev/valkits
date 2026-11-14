import { createHash } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { createWackyDbCatalog, type WackyDbCatalog } from "./wackydb-catalog"
import { indexWackyDbFiles, type YamlSourceFile } from "./wackydb-index"

export interface WackyDbSourceFiles {
  items: YamlSourceFile[]
  recipes: YamlSourceFile[]
  pieces: YamlSourceFile[]
}

async function readYamlDirectory(
  rootPath: string,
  category: "items" | "recipes" | "pieces",
): Promise<YamlSourceFile[]> {
  const directoryPath = join(rootPath, category)
  const fileNames = (await readdir(directoryPath))
    .filter((fileName) => fileName.endsWith(".yml"))
    .sort()
  const files: YamlSourceFile[] = []

  for (const fileName of fileNames) {
    files.push({
      path: `${category}/${fileName}`,
      contents: await readFile(join(directoryPath, fileName), "utf8"),
    })
  }

  return files
}

export async function readWackyDbSourceFiles(
  rootPath: string,
): Promise<WackyDbSourceFiles> {
  const [items, recipes, pieces] = await Promise.all([
    readYamlDirectory(rootPath, "items"),
    readYamlDirectory(rootPath, "recipes"),
    readYamlDirectory(rootPath, "pieces"),
  ])

  return { items, recipes, pieces }
}

export function fingerprintWackyDbSourceFiles(
  files: readonly YamlSourceFile[],
): string {
  const hash = createHash("sha256")
  const sortedFiles = [...files].sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  )

  for (const file of sortedFiles) {
    hash.update(file.path).update("\0").update(file.contents).update("\0")
  }

  return hash.digest("hex")
}

export async function buildWackyDbCatalog(rootPath: string): Promise<{
  catalog: WackyDbCatalog
  itemCount: number
  recipeCount: number
  pieceCount: number
}> {
  const sourceFiles = await readWackyDbSourceFiles(rootPath)
  const index = indexWackyDbFiles(
    sourceFiles.items,
    sourceFiles.recipes,
    sourceFiles.pieces,
  )
  const sourceFingerprint = fingerprintWackyDbSourceFiles([
    ...sourceFiles.items,
    ...sourceFiles.recipes,
    ...sourceFiles.pieces,
  ])

  return {
    catalog: createWackyDbCatalog(index, sourceFingerprint),
    itemCount: index.items.length,
    recipeCount: index.recipes.length,
    pieceCount: index.pieces.length,
  }
}