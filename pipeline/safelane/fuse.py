"""P1: one row per segment, raw metrics + f_* factors."""

# Base geometry options (real implementation in p1-data branch).
BASES = {"road_network": None, "bumpy_roads": None}


def run(base="road_network"):
    print(f"fuse (base: {base})")
