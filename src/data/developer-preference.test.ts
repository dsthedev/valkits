import { describe, expect, it, vi } from "vitest"
import { loadDeveloperPreference, saveDeveloperPreference } from "./developer-preference"

describe("developer preference", () => {
  it("defaults to off and safely rejects invalid saved settings", () => {
    expect(loadDeveloperPreference()).toBe(false)
    expect(loadDeveloperPreference({ getItem: () => "not json", setItem: vi.fn() })).toBe(false)
    expect(loadDeveloperPreference({ getItem: () => '{"version":1,"enabled":"true"}', setItem: vi.fn() })).toBe(false)
  })

  it("persists and restores the setting and handles storage failures", () => {
    let value: string | null = null
    const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next } }
    expect(saveDeveloperPreference(storage, true)).toBe(true)
    expect(loadDeveloperPreference(storage)).toBe(true)
    expect(saveDeveloperPreference(undefined, true)).toBe(false)
    expect(loadDeveloperPreference({ getItem: () => { throw new Error() }, setItem: vi.fn() })).toBe(false)
  })
})