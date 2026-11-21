import { describe, expect, it } from "vitest"
import { parseResourceGuide } from "./valheim-resource-guide"

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
})
