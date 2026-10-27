# SafeLane HN — wireframe

Text comes from `web/src/content/copy.ts`, colours from `web/src/content/theme.ts`.

## Desktop (1920×1080, viewport ≈ 1920×950)

Map 65% (≈1250 px) | sidebar 35% (≈670 px). The whole page is `h-screen`; only the sidebar scrolls,
and the top-10 list ends at ≈ 460 px, so it is always visible without scrolling.

```
+------------------------------------------------------------------+-------------------------------------------+
|                                                          [+]     | SafeLane HN                               |  56
|                                                          [-]     | Bike sensor rides show where Heilbronn    |
|                                                                  | should act first                          |
|        ~~~~~~~~ (very high, dark purple)                         +-------------------------------------------+
|                    \                                             | Safety priority                           |  48
|     ----------      \  ~~~~~~ (high)                             | [##][##][##][##][##]  [- - ]              |
|    (very low,        \                                           | V.low Low Med High V.high  Not enough data|
|     yellow)          ======= (selected: thicker + halo)          +-------------------------------------------+
|                         \                                        | Top 10 streets to act on                  |  ~320
|           - - - - - -    \                                       |  1 [#] Allee .................. 82   >    |
|           (not enough     \                                      |  2 [#] Weinsberger Str. ....... 77        |
|            data: grey,     ~~~~~~~                               |  3 [#] Kaiserstr. ............. 71        |
|            dashed)                                               |  4 [#] Neckarsulmer Str. ...... 66        |
|                                                                  |  5 [#] ...                    ..          |
|                     MAP (MapLibre, positron basemap)             |  6 [#] ...                    ..          |
|                                                                  |  7 [#] ...                    ..          |
|          click a line -> selects it in list + card               |  8 [#] ...                    ..          |
|          hover a line -> street name + score                     |  9 [#] ...                    ..          |
|                                                                  | 10 [#] ...                    ..          |
|                                                                  +-------------------------------------------+ <- ≈ 460 px
|                                                                  | Allee  (184 m)                  82  [###] |  ~200
|                                                                  | Measurements 41 · Overtakes 24            |
|                                                                  | Confidence [=========-] high              |
|                                                                  | Top reasons                               |
|                                                                  |  1. 58% of 24 overtakes closer than 150cm |
|                                                                  |  2. 3.6 danger points per 100 m           |
|                                                                  |  3. Fine dust 0.31 (city scale 0-1)       |
|                                                                  +-------------------------------------------+
|                                                                  | Weights                        [Reset]    |  ~170
|                                                                  | Close passes (i)   [=======o------] 35%   |
|                                                                  | Danger spots (i)   [=====o--------] 25%   |
|                                                                  | Rough surface (i)  [===o----------] 15%   |
|                                                                  | Fine dust (i)      [===o----------] 15%   |
|                                                                  | Stop-and-go (i)    [==o-----------] 10%   |
|                                                                  +-------------------------------------------+
|                                                                  | > How the score works   (collapsed)       |  40
+------------------------------------------------------------------+-------------------------------------------+
                                                                     total ≈ 56+48+320+200+170+40 ≈ 834 px
```

Notes
- Rows in the list are ≈ 28 px; `[#]` is the band colour chip. The selected row is highlighted and the
  map flies to that street.
- No selection: the card area shows `emptyStates.noSegmentSelected` (same height, so nothing jumps).
- No eligible streets: the list shows `emptyStates.noEligibleSegments`.
- `(i)` opens `factorTooltips[key]` on hover or focus.
- The method box is collapsed by default. Expanded, it shows the 60-word explanation and the
  three data limits, and the sidebar scrolls; the top-10 list does not move.
- Moving a slider re-ranks the list and recolours the map live.

## Mobile (≈ 390×844)

Single column; the page scrolls, the map does not capture vertical swipes outside it.

```
+--------------------------------------+
| SafeLane HN                          |
| Bike sensor rides show where         |
| Heilbronn should act first           |
+--------------------------------------+
|                                      |
|                                      |
|            MAP  (~50vh)              |
|                                      |
|                                      |
| +----------------------------------+ |
| | [#][#][#][#][#] low→high  [- -]  | |  <- compact legend overlaid on map
| +----------------------------------+ |
+--------------------------------------+
| Top 10 streets to act on             |
|  1 [#] Allee ................ 82  >  |
|  2 [#] Weinsberger Str. ..... 77     |
|  ...                                 |
| 10 [#] ...                    ..     |
+--------------------------------------+
| Detail card (selected street)        |
|  score, measurements, overtakes,     |
|  confidence, top reasons             |
+--------------------------------------+
| > Weights            (collapsed)     |
+--------------------------------------+
| > How the score works (collapsed)    |
+--------------------------------------+
```

Notes
- Tapping a list row scrolls up to the map and selects the street; tapping a line on the map scrolls
  down to the detail card.
- Touch targets are ≥ 44 px tall (list rows, slider thumbs, collapse toggles).
