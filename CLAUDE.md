# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from `bep-app/`:

```bash
npm run dev      # Dev server with network access (--host), usually port 5173
npm run build    # Production build → dist/
npm run preview  # Preview production build
```

Environment variables required in `bep-app/.env`:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Architecture

Single-page React app (Vite + Tailwind) with two pages:

- **`/`** — 손익분기점 계산기 (`src/components/`): Fixed cost inputs → BEP curve chart. States persist to Supabase (`bep_states` table via `src/utils/supabaseUtils.js`).
- **`/print-cost-simulator`** — 인쇄비 산출 시뮬레이터 (`src/pages/PrintCostSimulator.jsx`): All logic lives in one large file (~1500+ lines). Settings persist to `localStorage`. Presets save/load as JSON files via File System Access API (`showSaveFilePicker` / `showOpenFilePicker`).

## Key Data Flow

**BEP Calculator:** User inputs → `bepAt(F, C, x) = F/x + C` → chart.js curve. Saves to Supabase. `loadLatestSaveDB()` is called on PrintCostSimulator mount to get `save.bepNow` (the BEP unit price used as pricing floor).

**Print Cost Simulator:**
- `intClicks = Math.ceil(pages / 2) * copies` — interior print clicks
- `intSheets = Math.round(intClicks / 2)` — interior paper sheets
- Tier pricing: `tiers.find(t => t.maxClicks === null || intClicks <= t.maxClicks)` → `intClicks * tier.price`
- Formula pricing: `formulaPrice(intClicks, minClicks, maxClicks, curveK, bepNow, maxPrice)`
- `generateTiers()` applies `applyMonotonicity()` post-pass to prevent total-price inversions across page counts

**Competitor comparison** (`handleComparisonClick`): Uses `bep-app/src/data/더우린_A4_공급가액.json` (A4 POD supply prices, VAT-exclusive). Fixed paper spec: 내지 80g 백색모조지 (20원/장), 표지 300g 아트지 (74원/장).

## localStorage Keys

| Key | Contents |
|-----|----------|
| `printTiers_v3` | Current tier table (minClicks, maxClicks, midCount, tiers) |
| `printFormula_v1` | Formula params (curveK, formulaMaxPrice) |
| `printTiers_saves` / `printFormula_saves` | Snapshot history (up to 5 each) |
| `printCoatingTiers` / `printSaddleTiers` / `printPerfectTiers` / `printRingTiers` / `printScoringTiers` | Service cost tiers |

## Binding Calculation Functions

- `calcSaddleBinding(copies)` — 1~7부: 5,000원/부, 8~1,000부: 40,000원 flat
- `calcPerfectBinding(copies, intClicks)` — 1~3부: 5,000원/부, 4부+: ceil(min(intClicks,75000)/4000)×20,000원
- `calcRingBinding(copies, intPages)` — 160p 이하: 450원/부 (min 45,000원), 161p+: 500원/부 (min 50,000원)

## Excel Export

Uses SheetJS (`xlsx` package). Competitor comparison exports 3 sheets: 우리 가격 / 더우린 가격 / 차이. Uses `showSaveFilePicker` with fallback to `<a download>` for unsupported browsers.
