"""Collection names, thresholds, default weights."""

ATRAI_BASE = "https://api.atrai.bike"

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
