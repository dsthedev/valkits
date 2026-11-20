export interface StationUpgradePathEntry {
  prefab: string
  level: number
  name: string
}

export interface StationUpgradePath {
  name: string
  upgrades: readonly StationUpgradePathEntry[]
}

export const stationUpgradePaths = {
  piece_workbench: {
    name: "Workbench",
    upgrades: [
      { prefab: "piece_workbench_ext1", level: 2, name: "Chopping Block" },
      { prefab: "piece_workbench_ext2", level: 3, name: "Tanning Rack" },
      { prefab: "piece_workbench_ext3", level: 4, name: "Adze" },
      { prefab: "piece_workbench_ext4", level: 5, name: "Tool Shelf" },
    ],
  },
  forge: {
    name: "Forge",
    upgrades: [
      { prefab: "forge_ext1", level: 2, name: "Anvils" },
      { prefab: "forge_ext2", level: 3, name: "Forge Cooler" },
      { prefab: "forge_ext3", level: 4, name: "Grinding Wheel" },
      { prefab: "forge_ext4", level: 5, name: "Forge Bellows" },
      { prefab: "forge_ext5", level: 6, name: "Forge Toolrack" },
      { prefab: "forge_ext6", level: 7, name: "Smith's Anvil" },
    ],
  },
  piece_cauldron: {
    name: "Cauldron",
    upgrades: [
      { prefab: "cauldron_ext1_spice", level: 2, name: "Spice Rack" },
      { prefab: "cauldron_ext3_butchertable", level: 3, name: "Butcher's Table" },
      { prefab: "cauldron_ext4_pots", level: 4, name: "Pots and Pans" },
      { prefab: "cauldron_ext5_mortarandpestle", level: 5, name: "Mortar and Pestle" },
      { prefab: "cauldron_ext6_rollingpins", level: 6, name: "Rolling Pins and Cutting Boards" },
      { prefab: "cauldron_ext7_smoker", level: 7, name: "Smoker" },
    ],
  },
  blackforge: {
    name: "Black Forge",
    upgrades: [
      { prefab: "blackforge_ext1", level: 2, name: "Black Forge Cooler" },
      { prefab: "blackforge_ext2_vise", level: 3, name: "Vice" },
      { prefab: "blackforge_ext3_metalcutter", level: 4, name: "Metal Cutter" },
      { prefab: "blackforge_ext4_gemcutter", level: 5, name: "Gem Cutter" },
      { prefab: "blackforge_ext5_apron", level: 6, name: "Smith's Aprons" },
    ],
  },
  piece_magetable: {
    name: "Galdr Table",
    upgrades: [
      { prefab: "piece_magetable_ext", level: 2, name: "Rune Table" },
      { prefab: "piece_magetable_ext2", level: 3, name: "Unfading Candles" },
      { prefab: "piece_magetable_ext3", level: 4, name: "Feathery Wreath" },
      { prefab: "piece_magetable_ext4", level: 5, name: "Standing Loom" },
    ],
  },
  piece_artisanstation: {
    name: "Artisan Table",
    upgrades: [{ prefab: "artisan_ext1", level: 2, name: "Artisan Press" }],
  },
} as const satisfies Record<string, StationUpgradePath>

const upgradeLevelsByPrefab = new Map<string, number>()
for (const stationPath of Object.values(stationUpgradePaths)) {
  for (const upgrade of stationPath.upgrades) {
    upgradeLevelsByPrefab.set(upgrade.prefab, upgrade.level)
  }
}

export function getStationUpgradeLevel(prefab: string): number | undefined {
  return upgradeLevelsByPrefab.get(prefab)
}