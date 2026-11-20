# Copilot Instructions

## Project purpose

Build a local-first Valheim kit planner. The primary job is to help a
player define a target kit for a biome or progression milestone, then
calculate the resources needed to acquire every item in that kit.

A kit represents a desired set of end-state items, not a crafting queue
or a general-purpose game database browser.

Examples: - Meadows --- Starter Kit - Black Forest --- Troll Armor -
Black Forest --- Bronze Progression - Swamp --- Poison Preparation

The application should eventually calculate and present: 1. **Kit
resources** --- resources needed to craft/acquire the requested items,
including recursive ingredients and quality upgrades. 2. **Station
resources** --- resources needed to build and upgrade the crafting
stations to the levels required by those kit items. 3. **Combined
resources** --- an aggregated view of the two lists.

Keep the two calculations independent so users can view either list
separately or combine them.

## Development approach

Work incrementally and in dependency order. Do not implement several
unrelated features in one change.

Before changing code: 1. Inspect the existing project structure and
relevant files. 2. Identify the smallest dependency-complete feature
that can be implemented next. 3. Explain the intended files and changes
briefly. 4. Implement only that scope. 5. Run the relevant tests and
type checks. 6. Summarize changed files, behavior, verification results,
and any remaining limitations.

Do not assume a library is installed. Inspect `package.json` before
using a dependency. Prefer existing project conventions and installed
shadcn components.

The developer/user controls commits. Do not create commits.

## Core technical principles

-   Use TypeScript.
-   Use React function components and hooks.
-   Use the existing Vite, shadcn/ui, and Tailwind setup.
-   Use Zod for validation at external-data and persistence boundaries
    if installed; otherwise propose adding it before relying on it.
-   Use Vitest and React Testing Library if installed or approved for
    installation.
-   Use React Router only when navigation actually requires it.
-   Use dnd-kit only when a real drag-and-drop feature is being
    implemented.
-   Avoid adding dependencies for functionality that can be implemented
    simply with the current stack.
-   Keep the app client-side and local-first. Do not introduce a
    backend, accounts, cloud sync, analytics, or remote APIs unless
    explicitly requested.
-   Persist user-created kits and settings in localStorage. Keep
    imported game data separate from user data.
-   Handle malformed, missing, or outdated localStorage data safely.
    Validate before using it and provide a recoverable failure path
    rather than crashing.
-   Keep components small and focused. Separate data access, domain
    logic, persistence, and presentation.
-   Prefer explicit types and pure functions for calculations. Avoid
    hiding business rules inside React components.
-   Use prefab identifiers as stable keys and relationships. Never join
    game data by localized display names.
-   Do not invent game data or silently assume missing data means an
    item is gatherable.

## Scope boundaries

This is a **resource acquisition planner**, not an in-game stat
calculator.

Do not implement or prioritize: - Weapon damage, armor ratings, combat
formulas, durability, attack behavior, or character builds. - A
general-purpose Valheim wiki. - Multiplayer, user accounts, cloud
synchronization, or server integration. - Automatic recalculation on
every edit. - A crafting queue or time optimizer unless explicitly
requested.

Only retain item fields that support identification, kit editing,
recipes, resource calculation, station requirements, or useful item
display.

## Domain concepts

Keep these concepts distinct.

### Game item

Imported reference data describing an item. Use the prefab as its
canonical identifier.

Likely useful fields: - `prefab` - `nameToken` - `descriptionToken`
(optional) - `itemType` (optional) - `maxStackSize` - `maxQuality` -
`icon` (optional, only if a usable asset reference is available)

Do not copy every field from WackyDatabase into the application model.
Preserve original source files separately and normalize only the fields
the application needs.

### Game recipe

Imported recipe data describing how an item is produced.

Likely useful fields: - `resultPrefab` - `outputAmount` -
`craftingStation` (optional) - `minStationLevel` - `disabled` -
`disabledUpgrade` - `requireOnlyOneIngredient` - `requirements` -
`upgradeRequirements`

A recipe requirement should preserve: - `prefab` - `amount` -
`amountPerLevel` - `recover`

Do not infer the meaning of a source field from its name alone. Verify
semantics against representative exported records before using it in
calculations.

WackyDatabase examples currently observed: - Recipe YAML has `name`,
`craftingStation`, `minStationLevel`, `amount`, `disabled`,
`disabledUpgrade`, `m_noCraftOnlyUpgrade`, `requireOnlyOneIngredient`,
`upgrade_reqs`, and `reqs`. - A `reqs` entry appears in the form
`Prefab:Amount:AmountPerLevel:Recover`. - `upgrade_reqs` has been empty
in the examples inspected so far. Do not assume it is populated or
required for all upgrades. - Item YAML includes `name`, `m_name`,
`m_description`, `m_itemType`, `m_maxStackSize`, and `m_maxQuality`,
among many irrelevant gameplay fields.

Fermenter piece YAML can include `fermStationData.fermConversion` records
with `FromName`, `ToName`, `Amount`, and `Remove`. The Poison Resist mead
record maps `MeadBasePoisonResist` to `MeadPoisonResist` with `Amount: 6`;
the user confirms this means one base produces six potions. Import and
preserve these conversion fields. Do not use `Remove` to calculate
consumption until its semantics are separately verified.

Smelter piece YAML can include `smelterData.smelterConversion` records
with `FromName`, `ToName`, and `Remove`, plus a shared `fuelItem.name` and
`fuelPerProduct`. The current `Piece_smelter.yml` maps both `CopperOre` and
`CopperScrap` to `Copper`, and maps `TinOre` to `Tin`. These records do not
specify output yield; the current importer assumes one output per input as
a provisional rule. Verify that game behavior before treating the yield as
authoritative. Preserve but do not apply `Remove` until its semantics are
verified. Copper explicitly prefers `CopperOre` over `CopperScrap`; other
multiple processing inputs remain unresolved until a source-selection
workflow is added. Smelter fuel is counted as a direct resource requirement
and is not expanded through alternate fuel-production paths.

Cooking-station piece YAML can include `cookingStationData.cookConversion`
records with `FromName`, `ToName`, `CookTime`, and `Remove`. The regular
cooking station converts `RawMeat` to `CookedMeat`, while the iron cooking
station converts `SerpentMeat` to `SerpentMeatCooked`. Some conversions are
listed by both stations; when an otherwise identical conversion is listed
by the regular and iron cooking stations, prefer the regular station.
Cooking records do not specify output yield, so the importer currently uses
one output per input provisionally. Preserve but do not apply `Remove` until
its semantics are verified.

Treat these observations as provisional source-format knowledge. Keep
parsing isolated so it can be adjusted when more examples are inspected.

### Kit

A user-created milestone containing desired item acquisition goals.

A kit should have: - A stable app-generated ID. - A name. - A biome. -
An optional description. - An ordered list of item goals.

Do not add tags or elaborate guide hierarchies to the initial kit
feature.

A kit item goal references a game item by prefab. Goal-specific fields
depend on the item: - Equipment may specify a target quality. -
Stackable consumables/materials may specify a desired quantity. - Do not
force a generic quantity field onto every item. Use item metadata and
explicit rules to determine which controls make sense. - Keep special
cases explicit rather than guessing from one property alone.

Do not duplicate imported item metadata inside each kit goal. Store the
prefab reference and only the user-selected goal values.

### Live calculation results

Kit resources, station requirements, and station-resource calculations are
derived live whenever kit goals or relevant data settings change. Keep the
three results independent. Derive combined totals by aggregating kit and
station resources without mutating either result. Do not persist calculation
snapshots or show stale-result state in the current workflow.

## Resource calculation rules

Keep calculation logic in pure domain modules, independent of React.

### Kit resource calculation

The intended recursive process: 1. Read each kit goal. 2. Resolve its
item prefab. 3. Determine the quantity or target quality requested. 4.
Find the applicable recipe or acquisition source. 5. Calculate the
number of crafts needed, accounting for recipe output quantity. 6. Apply
verified quality-upgrade ingredient rules. 7. Recursively resolve
craftable ingredients. 8. Stop at known gatherable/acquired resources.
9. Aggregate totals by prefab.

Do not assume every item has exactly one recipe. Account for disabled
recipes, multiple recipes, alternative-ingredient recipes, missing
recipes, and processing recipes as the dataset investigation establishes
their behavior.

When exactly one enabled craft recipe coexists with processing conversions,
prefer the craft recipe. Multiple enabled craft recipes remain ambiguous;
when no enabled craft recipe exists, multiple processing conversions remain
ambiguous unless an explicitly verified source preference applies. For an
otherwise identical conversion listed by both cooking stations, prefer the
regular cooking station.

Do not silently classify an item with no recipe as a gatherable
resource. Distinguish: - Known gatherable/resource item. - Known item
with a recipe. - Known item with no known recipe/source. - Unknown
prefab. - Unsupported or ambiguous recipe.

For `requireOnlyOneIngredient`, do not simply sum every ingredient.
Implement its behavior only after confirming how WackyDatabase
represents alternatives and how the game interprets them.

Preserve `recover` and `amountPerLevel` in imported data. Apply them
only according to verified game behavior. The user has confirmed that
`amountPerLevel` on item upgrades is per quality level; still verify how
the exported recipe's base amount and level increments combine for each
recipe type.

### Station requirements and station resources

Keep station requirements separate from ordinary item-resource
requirements.

For each kit item, report the station and minimum level stated on its
selected craft recipe, then recursively include stations needed by the
recipe's ingredients and their processing paths. Raw ingredients with no
known production source do not create station requirements. Keep this
per-item result separate from resource requirements and surface missing
or ambiguous data. When the
item supports the requested quality and its recipe permits upgrades,
calculate the required station level as the recipe minimum plus
`targetQuality - 1`. Report invalid quality requests and disabled upgrades
as unresolved. A recipe with no station field means only that no station
was listed; do not infer why.

For supported processing conversions, report the processing station and
follow the conversion input to determine its crafting station. Preserve
the exported output yield and use it to calculate input batches. Preserve
`removeInput`, but do not apply it until its semantics are verified.

After per-item requirements are validated, combine requirements for the
same station by taking the highest required level, not by adding levels.
Keep the station list concise by grouping requirements per kit and making
the related item list expandable; retain the per-item levels for context.
This per-kit presentation does not replace the later cross-kit summary.
Keep station-resource totals separate from kit-resource totals. Calculate
base station construction materials and every known upgrade piece through
the required level, recursively resolving their item recipes. Report
missing or ambiguous station/upgrade data rather than estimating costs.
Only derive an upgrade level from a source identifier when that mapping is
verified. Maintain the user-verified station tier order in
`src/domain/station-upgrade-paths.ts`, cross-referencing each actual piece
prefab and its declared parent station. Do not infer tiers from prefab
suffixes; retain upgrades absent from the explicit map as unresolved.
For now, do not recursively include stations needed to build station
pieces; state this limitation. Derive combined totals later without
mutating either source list.
Do not apply requirement per-level increments or recovery flags until their
semantics for station-piece construction are verified; surface these as
calculation limitations.

Do not treat special prefab requirements such as `Upgrader1Weapon` or
`Upgrader1Armor` as station levels unless verified. They may be actual
recipe ingredients or special game resources. Preserve them as
requirements until their role is understood.

Station construction and upgrade data may be incomplete initially.
Report unresolved station requirements instead of fabricating a resource
cost.

### Combined resources

Keep `kitResources` and `stationResources` separate in the calculation
result. Derive combined totals by aggregating both lists by prefab. Do
not mutate either source list when creating the combined view.

Avoid double-counting shared station infrastructure. Multiple kit items
using the same station should share one station requirement at the
highest required level.

## Data import and source files

WackyDatabase BulkYML exports are the current candidate source.

Keep raw exported YAML separate from application source code and
user-created data. Do not place large raw datasets directly inside React
components or hand-maintain normalized copies.

Create an isolated import/normalization layer that: 1. Loads the raw
source files. 2. Parses YAML. 3. Converts source records into typed
application models. 4. Validates normalized records. 5. Reports
malformed records, missing references, duplicate prefabs, and
unsupported fields. 6. Exposes a predictable data-access API to the rest
of the app.

Do not make UI components parse YAML directly.

When parsing recipe requirement strings, handle malformed values and
delimiters safely. Do not rely on naïve string splitting if values can
contain delimiters. Add tests using real exported samples.

Keep source provenance/version information so a future WackyDatabase
export can replace the dataset and trigger recalculation when
appropriate.

## UI and interaction principles

-   Keep navigation kit-centered and simple.
-   Build the smallest useful interface before adding secondary views.
-   Search should operate against the imported item index, not a
    hardcoded list.
-   Search results should use prefab identity and available display
    metadata.
-   Adding an item to a kit should prevent accidental duplicate goals or
    define a clear duplicate behavior.
-   Update kit resources, station requirements, and station resources
    immediately when kit goals change.
-   Show direct kit ingredients and combined recursive kit/station totals
    in the quick reference; keep detailed station and unresolved information
    in the advanced breakdown.
-   Show unresolved requirements and calculation limitations clearly.
-   Keep kit resources, station resources, and combined totals
    distinguishable.
-   Do not add decorative dashboards or statistics that do not help
    users build or calculate kits.
-   Use accessible labels, keyboard-operable controls, and clear
    empty/loading/error states.

## Suggested dependency-oriented implementation order

Do not skip foundational dependencies just to build visible UI sooner.
Adjust the sequence when repository inspection reveals a prerequisite is
missing.

### Phase 1 --- Domain types and validation

-   Define biome values and core domain types.
-   Define `GameItem`, `GameRecipe`, recipe requirements, kit, kit item
    goal, resource total, station requirement, and calculation snapshot.
-   Add Zod schemas at import and persistence boundaries if Zod is
    installed.
-   Add focused tests for schema validation.
-   Keep types independent of React.

### Phase 2 --- Game-data source and importer

-   Add a small representative fixture set from real WackyDatabase
    exports.
-   Implement YAML loading and parsing.
-   Normalize item, recipe, and supported processing-conversion records.
-   Validate prefab references and duplicate records.
-   Build an item lookup/search index.
-   Test valid, malformed, incomplete, and duplicate records.
-   Do not import the entire export until the importer works on
    representative fixtures.

### Phase 3 --- Data access and item search

-   Create a small typed API for looking up items and searching by
    name/token/prefab.
-   Implement search against imported data.
-   Add a minimal item search UI.
-   Test search behavior independently of the UI where possible.

### Phase 4 --- Kit CRUD and persistence

-   Create, view, edit, and delete kits.
-   Add item goals to a kit and remove them.
-   Implement the item-specific goal controls (quality or quantity where
    appropriate).
-   Persist kits in localStorage with validation and a versioned storage
    envelope.
-   Test persistence, migration/failure behavior, and CRUD operations.

### Phase 5 --- Recipe graph and resource calculation

-   [x] Build pure functions for unique enabled recipe lookup, craft-count
    calculation, recursive dependency resolution, and aggregation.
-   [x] Detect circular recipe dependencies.
-   [x] Surface missing, disabled, ambiguous recipes and alternative
    requirements as unresolved.
-   [x] Calculate output quantities and per-level quality ingredients;
    recursively resolve those ingredients.
-   [x] Resolve supported processing conversions using exported output
    yields; leave removal-flag semantics unapplied.
-   Start with known simple recipes and expand as source cases are
    verified.

### Phase 6 --- Live calculation results

-   [x] Derive kit resource, station requirement, and station-resource
    results from the current kit and source data.
-   [x] Keep each result independent and derive combined totals without
    mutating the source lists.
-   [x] Show direct and full costs in a quick reference and detailed
    requirements in an advanced breakdown.

### Phase 7 --- Station requirements and station-resource calculation

-   [x] Report per-item station levels for the requested item quality using
    the verified recipe minimum plus one station level per quality upgrade.
    Keep station-resource costs separate and surface unsupported requests.
-   [x] Group per-kit station requirements at the highest minimum level
    and keep the item breakdown expandable.
-   [x] Validate the reported station requirements against source records.
-   [x] Calculate station construction and known upgrade-piece resource
    totals separately from kit resources.
-   [x] Reuse recursive item-recipe resolution for station materials.
-   [x] Surface unresolved station dependencies and material sources.
-   Expand stations required to build station pieces.

### Phase 8 --- Combined totals and usability

-   [x] Derive combined resource totals from kit and station lists without
    mutating either list.
-   Add filtering/sorting and useful display grouping only when needed.
-   Improve empty states, error messages, accessibility, and import
    diagnostics.
-   Consider export/import of user kits after the core workflow is
    reliable.

This order is a guide, not a rigid contract. Keep changes small and
preserve working behavior.

## Testing expectations

Every meaningful domain rule should have tests.

Prioritize tests for: - Parsing actual item and recipe YAML samples. -
Recipe requirement string parsing. - Prefab lookup and item search. -
Recipe output quantities. - Per-quality ingredient increments. -
Recursive ingredient resolution. - Aggregation of shared resources. -
Circular dependencies. - Missing and disabled recipes. - Alternative
ingredient behavior once confirmed. - Station-level calculation. -
Shared station requirement deduplication. - Live recalculation when goal
membership, quantity, or quality changes. - localStorage validation and
recovery.

Use small fixtures that represent real exported records. Avoid tests
that merely restate implementation details. Test quality-dependent station
levels against representative item and recipe exports.

Run the project's available typecheck, lint, and test scripts after each
relevant change. Do not claim a check passed unless it was actually run.

## Instruction maintenance feedback loop

This file is part of the project and must evolve with it.

When a requirement, data-source discovery, architecture decision, or
dependency changes: 1. Check whether this file still accurately
describes the project. 2. Update the relevant section in the same change
when implementation decisions make the instructions outdated. 3. Remove
obsolete assumptions rather than accumulating contradictory rules. 4.
Record uncertain game-data behavior as unverified; do not turn a
hypothesis into a rule. 5. Keep the implementation order synchronized
with actual dependencies and completed phases.

If a requested feature conflicts with these instructions, do not blindly
follow either. Identify the conflict, explain the tradeoff, and ask for
direction when the product decision is ambiguous.

Do not rewrite this entire file for minor changes. Make the smallest
accurate update and mention it in the change summary.
