# Top-10 check

Data: `data/out/segments.geojson`, contract 1.1 (twins merged, f_safety shrunk with k = 10, danger length floor 50 m), generated 2026-10-27.
Re-check after every pipeline run with `python3 qa/check_data.py` (A9 reads this table).

**Verdict rules.** A segment is SUSPICIOUS if any of these holds. Otherwise it is OK.

- **S1** fewer than 20 overtakes (small sample)
- **S2** average cycling speed under 3 km/h. Riders were mostly standing, so the "passes" may be cars filtering past a queue at a light, or a box left running while parked.
- **S3** shorter than 25 m (a junction stub)
- **S4** an off-road path ("Path along …") with overtakes. These are probably passes on the adjacent road, matched to the path.

| Rank | id | Street | Length m | Overtakes | < 150 cm | Avg pass cm | Avg speed km/h | Score | Verdict | Why |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `seg_032464` | Path along Pfaffenstraße | 66.9 | 35 | 100% | 76.5 | 0.99 | 76.1 | SUSPICIOUS | S2, S4: 1273 points at about 1 km/h |
| 2 | `seg_028814` | Theodor-Fischer-Straße | 94.0 | 46 | 100% | 83.0 | 1.41 | 75.5 | SUSPICIOUS | S2 |
| 3 | `seg_011483` | Path along Wilhelmstraße | 70.2 | 20 | 100% | 76.2 | 0.73 | 75.3 | SUSPICIOUS | S2, S4 |
| 4 | `seg_001923` | (unnamed) | 102.7 | 30 | 100% | 51.2 | 4.16 | 75.2 | OK | Real sample, but no street name. Locate it on the map before quoting it. |
| 5 | `seg_021301` | Path along Gartenstraße | 93.5 | 53 | 100% | 49.6 | 2.38 | 75.2 | SUSPICIOUS | S2, S4 |
| 6 | `seg_003068` | Kaiserstraße | 21.6 | 46 | 100% | 85.8 | 2.64 | 74.6 | SUSPICIOUS | S2, S3 |
| 7 | `seg_028813` | Theodor-Fischer-Straße | 96.1 | 202 | 100% | 93.3 | 6.13 | 74.6 | OK | Strongest evidence in the list: 202 passes on 96 m, all under 150 cm |
| 8 | `seg_011992` | Haigernstraße | 62.5 | 89 | 100% | 39.6 | 1.67 | 74.5 | SUSPICIOUS | S2: 40 cm average at 1.7 km/h looks like standing next to vehicles |
| 9 | `seg_033606` | Path along Kirchbrunnenstraße | 11.5 | 25 | 100% | 43.7 | 0.82 | 74.2 | SUSPICIOUS | S2, S3, S4 |
| 10 | `seg_012747` | (unnamed) | 89.3 | 15 | 100% | 54.3 | 1.27 | 73.9 | SUSPICIOUS | S1, S2 |

**Result: 2 OK, 8 SUSPICIOUS.**

## What changed since the G2 audit

Before contract 1.1, all 10 were suspicious. Five of them rested on 1–4 overtakes, five were hidden under a duplicate twin on the map, and 9 were unnamed.
Now every top-10 segment has 15–202 overtakes, none has a twin, and 8 have a street name.

## What is left, and the decision for the team

The remaining pattern is in the data, not in the code:

- 558 of the 863 segments with overtakes report **100%** of passes under 150 cm, and the city-wide share is 80.7%. f_safety therefore barely separates streets.
- f_danger is capped at 1 for the whole top 15.
- What decides the order is stop-and-go (`f_flow`) and confidence, and both are highest where riders wait at lights.

A speed filter (drop safety and danger where avg speed < X km/h) was simulated and **not** applied:

| Filter | Eligible segments affected | New top 10 |
|---|---|---|
| < 3 km/h | 43 | Still includes 4–13-overtake paths |
| < 5 km/h | 80 | Theodor-Fischer-Str. (202), Austraße (65), Weipertstraße (62, 21), … but also Stielerstraße (2), Lohtorstraße (4) |
| < 8 km/h | 153 | Mostly named streets with 17–65 overtakes, but Stielerstraße (2) stays at #6 |

None of these filters is clean on its own; any one of them would need S1 too (for example, at least 20 overtakes to rank on safety). Choosing one is a method change, so per CONTRACT 3.6 it needs team agreement.
**For the pitch:** lead with Theodor-Fischer-Straße (`seg_028813`), not with rank 1, and say plainly that the sensor sees most passes as close everywhere.
