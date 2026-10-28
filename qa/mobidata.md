# MobiData BW check (bike counters, motor traffic counts)

Checked 2026-10-28, about 25 minutes. Context only: nothing here changes the score.

## Bike counters: found, integrated

Dataset: [Gebündelte Daten Eco-Counter Fahrradzählstellen Baden-Württemberg](https://mobidata-bw.de/dataset/eco-counter-fahrradzahler) (`eco-counter-fahrradzahler`), licence Datenlizenz Deutschland – Namensnennung 2.0.

What was checked:

- `package_search?q=eco-counter`: 5 datasets; only `eco-counter-fahrradzahler` covers Heilbronn (the others are Konstanz, Heidelberg, charging points, ride sharing).
- The [tutorial](https://www.mobidata-bw.de/data/Tutorial_EcoCounter-Daten.pdf): daily values per year in `v2/fahrradzaehler_tageswerten_{yyyy}.json.gz`, one record per site with a `channels` list (`iso_timestamp`, `direction`, `counts`).
- The "Fahrradzähldaten (JSON)" resource (`eco_counter_fahrradzaehler.json`) is not a site list but one week of hourly values (16–23 June 2025); it showed 4 Heilbronn sites.
- The daily files for 2025, 2026, 2026-10 and the rolling current file: 15 sites in the domain "Stadt Heilbronn", but that domain includes the county (Bad Wimpfen, Leingarten, Ellhofen, Talheim, Cleebronn, …). No site name contains "Heilbronn" except a Neckarsulm counter on "Heilbronner Straße".

Selection: sites inside `meta.bbox` (the 2–98% view of our segments). 9 counters:

| Counter | Operator domain | Avg bikes/day | Days with data (last 365) |
|---|---|---:|---:|
| Neckarufer | Stadt Heilbronn | 2089 | 346 |
| 1 Wilhelm-Leuschner-Straße (CITIX AI) | Stadt Heilbronn | 1578 | 137 |
| Neckarbogen | Stadt Heilbronn | 1026 | 309 |
| 2 Bismarckstraße – Nur Radverkehr | Stadt Heilbronn | 631 | 184 |
| Route Nord | Stadt Heilbronn | 353 | 346 |
| 3 Neckarsulmer Str. | Stadt Heilbronn | 348 | 185 |
| 5 Im Haselter | Stadt Heilbronn | 262 | 184 |
| Route Süd | Stadt Heilbronn | 213 | 345 |
| Heilbronner Straße | Stadt Neckarsulm | 153 | 281 |

Caveats:

- `avg_daily_bikes` is the mean over days with data in the last 365 days, from the `ALL` channel (or IN + OUT where `ALL` is missing). Counters installed in 2026 average over fewer days (`n_days` in the file), so their averages lean towards spring–autumn.
- No published file covers 2–17 October 2026 (the 2026 yearly file ends on 1 October, the rolling file starts on 18 October).
- "1 Wilhelm-Leuschner-Straße (CITIX AI)" is named "Fuß- und Radverkehr": it may count pedestrians too. The data has no mode field.
- Three more counters lie inside the full segment extent but outside `meta.bbox` (Leingarten, Klingenberger Steg Nordheim, RK 8 Sulmstraße); widen the bbox in `counters.run` to include them.

Output: `pipeline/safelane/counters.py` → `data/out/counters.geojson` (`python run.py --counters`, part of `--all`), copied to `web/public/data/` by `--publish`. Test: `pipeline/tests/test_counters.py`.

## Motor traffic counts per street: none for Heilbronn

`package_search` for "Verkehrszählung" (10 results) and "Kfz" (7 results), plus "Verkehrszählung Heilbronn", "Kfz Heilbronn" and "Heilbronn". Results that mention Heilbronn or could cover it:

- [Kfz und Verkehrsbelastung Heilbronn](https://mobidata-bw.de/dataset/kfz-und-verkehrsbelastung-heilbronn): vehicle stock since 1976 and annual mileage since 2017 for the Stadtkreis. County totals, **not per street**.
- [Stundenwerte der Dauerzählstellen in Baden-Württemberg](https://mobidata-bw.de/dataset/stundenwerte_dauerzaehlstellen): hourly counts from permanent stations on Autobahnen and Bundesstraßen. May include stations near Heilbronn (A6, A81, B27, B39), **not city streets**.
- [Bundesweite Straßenverkehrszählung](https://mobidata-bw.de/dataset/bundesweite_strassenverkehrszaehlung): five-yearly counts on Autobahnen and Bundesstraßen (latest 2015, PDF). **Not city streets**.

The per-street count datasets found (`zaehldaten-*`, `mobile-verkehrsz-hlungen-*`) are for Ravensburg, Weingarten, Berg, Baienfurt, Baindt and Konstanz. Not integrated, as asked.
