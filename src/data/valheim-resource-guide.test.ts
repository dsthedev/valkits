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
            },
          ],
        },
      ],
    })

    expect(guide.categories.map(({ id }) => id)).toEqual([
      "general",
      "meadows",
    ])
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
})
