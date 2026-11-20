export interface StationUpgradePathEntry {
  prefab: string
  level: number
}

export const stationUpgradePaths = {
  piece_workbench: [
    { prefab: "piece_workbench_ext1", level: 2 },
    { prefab: "piece_workbench_ext2", level: 3 },
    { prefab: "piece_workbench_ext3", level: 4 },
    { prefab: "piece_workbench_ext4", level: 5 },
  ],
  forge: [
    { prefab: "forge_ext1", level: 2 },
    { prefab: "forge_ext2", level: 3 },
    { prefab: "forge_ext3", level: 4 },
    { prefab: "forge_ext4", level: 5 },
    { prefab: "forge_ext5", level: 6 },
    { prefab: "forge_ext6", level: 7 },
  ],
  piece_cauldron: [
    { prefab: "cauldron_ext1_spice", level: 2 },
    { prefab: "cauldron_ext3_butchertable", level: 3 },
    { prefab: "cauldron_ext4_pots", level: 4 },
    { prefab: "cauldron_ext5_mortarandpestle", level: 5 },
    { prefab: "cauldron_ext6_rollingpins", level: 6 },
    { prefab: "cauldron_ext7_smoker", level: 7 },
  ],
  blackforge: [
    { prefab: "blackforge_ext1", level: 2 },
    { prefab: "blackforge_ext2_vise", level: 3 },
    { prefab: "blackforge_ext3_metalcutter", level: 4 },
    { prefab: "blackforge_ext4_gemcutter", level: 5 },
    { prefab: "blackforge_ext5_apron", level: 6 },
  ],
  piece_magetable: [
    { prefab: "piece_magetable_ext", level: 2 },
    { prefab: "piece_magetable_ext2", level: 3 },
    { prefab: "piece_magetable_ext3", level: 4 },
    { prefab: "piece_magetable_ext4", level: 5 },
  ],
  piece_artisanstation: [{ prefab: "artisan_ext1", level: 2 }],
} as const satisfies Record<string, readonly StationUpgradePathEntry[]>

const upgradeLevelsByPrefab = new Map<string, number>(
  Object.values(stationUpgradePaths)
    .flat()
    .map(({ prefab, level }) => [prefab, level] as const),
)

export function getStationUpgradeLevel(prefab: string): number | undefined {
  return upgradeLevelsByPrefab.get(prefab)
}