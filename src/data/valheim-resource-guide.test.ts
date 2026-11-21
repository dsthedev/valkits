import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  filterResourceCategories,
  parseResourceGuide,
} from "./valheim-resource-guide"

describe("parseResourceGuide", () => {
  it("places the general category first and preserves resource details", () => {
    const guide = parseResourceGuide({
      categories: [
        {
          id: "meadows",
          label: "Meadows",
          resources: [],
        },
        {
          id: "general",
          label: "Found in many places",
          resources: [
            {
              name: "Wood",
              source: "Trees",
              tip: "Chop trees.",
              wikiUrl: "https://valheim.weirdgloop.org/wiki/Wood",
              acquisitionTypes: ["plants", "creatures"],
            },
          ],
        },
      ],
    })

    expect(guide.categories.map(({ id }) => id)).toEqual(["general", "meadows"])
    expect(guide.categories[0]?.resources[0]).toMatchObject({
      name: "Wood",
      source: "Trees",
      tip: "Chop trees.",
    })
  })

  it("rejects malformed resource links", () => {
    expect(() =>
      parseResourceGuide({
        categories: [
          {
            id: "general",
            label: "Found in many places",
            resources: [
              {
                name: "Wood",
                source: "Trees",
                tip: "Chop trees.",
                wikiUrl: "not a URL",
              },
            ],
          },
        ],
      })
    ).toThrow()
  })

  it("filters resources by name, source, or gathering tip", () => {
    const categories = parseResourceGuide({
      categories: [
        {
          id: "general",
          label: "Found in many places",
          resources: [
            {
              name: "Wood",
              source: "Trees",
              tip: "Chop trees.",
              wikiUrl: "https://valheim.weirdgloop.org/wiki/Wood",
            },
            {
              name: "Stone",
              source: "Rocks",
              tip: "Gather while mining.",
              wikiUrl: "https://valheim.weirdgloop.org/wiki/Stone",
              acquisitionTypes: ["mining"],
            },
          ],
        },
        {
          id: "meadows",
          label: "Meadows",
          resources: [
            {
              name: "Raspberry",
              source: "Bushes",
              tip: "Pick ripe berries.",
              wikiUrl: "https://valheim.weirdgloop.org/wiki/Raspberry",
              acquisitionTypes: ["plants"],
            },
          ],
        },
      ],
    }).categories

    expect(filterResourceCategories(categories, "MINING")).toEqual([
      {
        ...categories[0]!,
        resources: [categories[0]!.resources[1]!],
      },
    ])
    expect(filterResourceCategories(categories, "bush")).toEqual([
      {
        ...categories[1]!,
        resources: [categories[1]!.resources[0]!],
      },
    ])
    expect(filterResourceCategories(categories, "  ")).toEqual(categories)
  })

  it("combines section, acquisition and search filters without changing guide order", () => {
    const categories = parseResourceGuide({
      categories: [
        {
          id: "general",
          label: "General",
          resources: [
            {
              name: "Wood",
              source: "Trees",
              tip: "Chop.",
              wikiUrl: "https://example.com/wood",
              acquisitionTypes: ["plants", "creatures"],
            },
            {
              name: "Stone",
              source: "Rocks",
              tip: "Mine.",
              wikiUrl: "https://example.com/stone",
              acquisitionTypes: ["mining"],
            },
            {
              name: "Mystery",
              source: "Unknown",
              tip: "Verify.",
              wikiUrl: "https://example.com/mystery",
              acquisitionTypes: [],
            },
          ],
        },
        { id: "empty", label: "Empty", resources: [] },
      ],
    }).categories
    const names = (result: typeof categories) =>
      result.flatMap((category) =>
        category.resources.map((resource) => resource.name)
      )

    expect(
      names(
        filterResourceCategories(categories, "", { acquisition: "creatures" })
      )
    ).toEqual(["Wood"])
    expect(
      names(
        filterResourceCategories(categories, "wood", { acquisition: "mining" })
      )
    ).toEqual([])
    expect(
      names(
        filterResourceCategories(categories, "", {
          acquisition: "unclassified",
        })
      )
    ).toEqual(["Mystery"])
    expect(
      filterResourceCategories(categories, "", { categoryId: "empty" })
    ).toHaveLength(1)
    expect(
      names(filterResourceCategories(categories, "", { sort: "name-asc" }))
    ).toEqual(["Mystery", "Stone", "Wood"])
    expect(
      names(filterResourceCategories(categories, "", { sort: "name-desc" }))
    ).toEqual(["Wood", "Stone", "Mystery"])
    expect(
      names(filterResourceCategories(categories, "", { sort: "source" }))
    ).toEqual(["Stone", "Wood", "Mystery"])
    expect(categories[0]?.resources.map((resource) => resource.name)).toEqual([
      "Wood",
      "Stone",
      "Mystery",
    ])
  })

  it("validates the supplied guide's notes and classifications", () => {
    const guide = parseResourceGuide(
      JSON.parse(
        readFileSync(
          new URL(
            "../../public/data/valheim-resource-guide.json",
            import.meta.url
          ),
          "utf8"
        )
      )
    )
    expect(
      guide.categories.every(
        (category) => category.storageNote && category.expeditionNote
      )
    ).toBe(true)
    const resources = guide.categories.flatMap((category) => category.resources)
    expect(
      resources
        .filter((resource) => resource.acquisitionTypes.length === 0)
        .map((resource) => resource.name)
    ).toEqual(["Bonemaw Scale"])
    expect(
      resources.find((resource) => resource.name === "Wood")?.acquisitionTypes
    ).toContain("creatures")
  })
})
