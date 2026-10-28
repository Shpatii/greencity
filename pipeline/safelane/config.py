"""Collection names, thresholds, default weights."""

ATRAI_BASE = "https://api.atrai.bike"
# Sent to ATRAI, Overpass and MobiData so their operators can tell who is calling.
USER_AGENT = "safelane-hn/1.0 (+https://github.com/Shpatii/greencity)"

COLLECTIONS = {
    "road_network": "road_network_heilbronn",
    "overtaking": "overtaking_distance_heilbronn",
    "danger": "danger_zones_heilbronn",
    "danger_pm": "danger_zones_PM_heilbronn",
    "roughness": "bumpy_roads_heilbronn",
    "traffic_flow": "traffic_flow_heilbronn",
    "speed": "speed_map_heilbronn",
}

DEFAULT_WEIGHTS = {
    "safety": 0.35,
    "danger": 0.25,
    "surface": 0.15,
    "air": 0.15,
    "flow": 0.10,
}

MIN_POINTS = 5
CONFIDENCE_N = 30
METRIC_CRS = "EPSG:25832"
MATCH_DISTANCE_M = 20  # point layers -> nearest segment
LINE_MATCH_DISTANCE_M = 10  # line layer midpoint -> nearest segment
NAME_FALLBACK_M = 30  # unnamed segment -> "Path along <nearest named street>"
# Small samples (CONTRACT 3.2): f_safety is shrunk toward the city-wide pass severity with
# the weight of SAFETY_PRIOR_K overtakes; danger points per 100 m use at least this length.
SAFETY_PRIOR_K = 10
DANGER_MIN_LENGTH_M = 50

# Method 1.2 (CONTRACT 3.2): close passes and danger points (both from the overtaking sensor)
# count only where they are reliable evidence (qa/top10-check.md S1-S4).
# Overtakes and danger points on these OSM highways are dropped: no car overtakes a rider there.
CAR_FREE_HIGHWAYS = ("cycleway", "footway", "path", "pedestrian", "steps", "bridleway")
# Below this average cycling speed riders were mostly standing (traffic lights, a parked bike).
STATIONARY_SPEED_KMH = 5
# Shorter than GPS can reliably place a pass (junction stubs).
MIN_PASS_LENGTH_M = 25
# Fewer overtakes are too small a sample to rank a section on.
MIN_OVERTAKES = 20
# f_safety rates how close passes were; weight per overtaking bin 0-50, 50-100, 100-150, 150-200, >200 cm.
SEVERITY_WEIGHTS = (1.0, 0.67, 0.33, 0.0, 0.0)
# validate --mode full fails below this share of segments with an OSM infra_class (CONTRACT 3.2b).
MIN_OSM_COVERAGE = 0.9
