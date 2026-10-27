# SafeLane HN — demo script

Placeholders in `[BRACKETS]` must be filled before Wednesday. Do not say them out loud as-is.

Before any demo:
- Run `python run.py --publish` so the app shows real data. If the red **MOCK DATA** badge is still
  visible, say so in the first sentence ("This is test data; the real run lands Wednesday").
- Open the app in a fresh tab, map fully loaded, method box closed, default weights.
- Zoom the browser so the sidebar's top-10 list is fully visible without scrolling.

---

## 1. 30-second fair demo (booth / walk-up)

One person drives, the same person talks. Every step is one click and one sentence.

| Time | Click / point | Say |
|---|---|---|
| 0:00 | App is already open. Sweep a hand over the map. | "This is every street in Heilbronn that cyclists rode with a senseBox:bike sensor." |
| 0:05 | Point at the darkest (purple) line on the map. | "The darker the street, the sooner the city should look at it." |
| 0:10 | Click **#1** in the list on the right. | "This is the number one street to act on." |
| 0:15 | Point at the first line under **Top reasons** on the card and read it aloud. | Read it word for word, e.g. "58% of 24 overtakes were closer than 150 cm." |
| 0:22 | Click **How we score**. | "Here is how we score: five measured factors, weighted, 0 to 100, and we tell you what the data can't show." |
| 0:28 | Hand the mouse over. | "Try the sliders yourself." |

If someone asks a follow-up, go to the jury answers in section 3.

---

## 2. 5-minute stage outline

### 0:00–0:30 Problem (one real number)

- Open on the problem, not the product: "In Heilbronn, [NUMBER] of every 100 cars that overtake a
  cyclist pass closer than the legal 1.5 m."
  - Source for [NUMBER]: share_below_150 across all overtakes in the real run (P1 to supply Wednesday).
- "The city knows this is a problem. It doesn't know which streets to fix first."

### 0:30–2:30 Live demo (2 min)

1. Map overview (15 s): colour = priority, grey dashed = not enough data. Point at the legend.
2. Darkest street → click #1 in the list (30 s): read the top reason aloud, show measurements,
   overtakes and the confidence bar.
3. Click a second street lower in the list (20 s): "Different street, different reason." Contrast
   the top reason (e.g. rough surface instead of close passes).
4. Move a weight slider live (40 s): drag **Fine dust** up. "If the city cares more about air
   quality, the ranking changes in real time." Point at a street that moves into the top 10.
   Click **Reset**.
5. Grey dashed street (15 s): "Grey means unmeasured, not safe. We never hide that."

Fallback if the live app fails: pre-recorded screen capture at `[PATH TO VIDEO]`; keep talking over it.

### 2:30–3:15 Method and limits (45 s)

- Open **How we score**. Five factors, each 0–1 relative to the rest of the city: close passes,
  danger spots, rough surface, fine dust, stop-and-go.
- Score = 100 × confidence × weighted sum. Default weights 35 / 25 / 15 / 15 / 10.
- A street needs at least 5 measurements to get a rank; its score reaches full confidence at 30.
- Say the three limits plainly: self-chosen routes, AI-detected overtakes, few measurements on some
  streets. "We show the confidence on every card so nobody over-reads one number."

### 3:15–4:15 Impact for Heilbronn + Green City Dashboard (1 min)

- Output is a ranked list the city can act on: top streets, each with one-sentence reasons a
  council member can read without a GIS background.
- How it plugs into the Green City Dashboard:
  - The pipeline writes two plain files, `segments.geojson` and `meta.json`, plus `ranking.csv`.
    Any map dashboard can load the GeoJSON as a layer; the CSV goes into a table or report.
  - Re-running is one command (`python run.py --all`), so new rides update the ranking.
  - `[TO CONFIRM with organisers: how the dashboard ingests layers (GeoJSON upload, URL, iframe embed)]`
- `[OPTIONAL: one concrete example, e.g. "the top 3 streets are all within 500 m of a school"; only if the real data shows it]`

### 4:15–5:00 Team and next steps (45 s)

- Team, one line each: P1 data pipeline, P2 web app, P3 scoring and QA, P4 design and story.
  `[NAMES]`
- Next steps:
  1. Run with the city's transport team to set their own weights.
  2. Targeted rides on grey (unmeasured) streets to close the data gaps.
  3. Printable PDF priority list for council meetings (in progress).
  4. Second city (see question 6).
- Close: "Bike sensors already collect the data. SafeLane HN turns it into a to-do list."

---

## 3. Likely jury questions

**1. Isn't the data biased toward streets that volunteers like to ride?**
Yes, and we say so on screen. Riders chose their own routes, so busy cycle routes have more data.
That is why a street needs at least 5 measurements to be ranked, its score is scaled down until
it has 30, and unmeasured streets are grey, not green. The fix is targeted rides on the grey streets.

**2. Why these weights?**
They are a transparent starting point, not a claim of truth. Close passes get the most weight (35%)
because they are the most direct injury risk and 1.5 m is the legal minimum in town. The point of
the sliders is that the city sets its own priorities and sees the effect live.
`[If done before Wednesday: "The top 5 streets stay in the top 10 under every weighting we tested."]`

**3. How accurate is the overtaking detection?**
Overtakes are detected by an AI model on the sensor data, so single events can be missed or
miscounted. `[ACCURACY FIGURE from ATRAI/senseBox, if published; otherwise say: "We don't have an independent accuracy figure"]`
We never rank on one event: the score uses the share of close passes across all overtakes on
a street, and each card shows how many measurements it rests on.

**4. Who maintains this after the hackathon?**
There is no server to run. The pipeline is one command that writes static files; the web app is
a static site. Whoever owns the city's dashboard data can re-run it when new rides come in.
`[PROPOSED OWNER: e.g. city Green City / mobility team; confirm before pitching]`

**5. What does it cost?**
Close to nothing to run: static files on any web host, no database, no paid APIs. The basemap
uses CARTO's free tiles; for production use we would check their terms or self-host OpenStreetMap
tiles. The real cost is people: someone re-runs it, and riders collect data.

**6. Can it work in another city?**
Yes, if that city has senseBox:bike rides on the ATRAI platform. The scoring and the web app
are city-independent; the data collection names change in one config file (`pipeline/safelane/config.py`),
plus the metric map projection for cities outside UTM zone 32.
`[TO CONFIRM: which other cities ATRAI already covers]`
