# backend/render_cost.py  — v2: realistic energy model

import math

# Carbon intensity (g CO₂ per Wh) — global average grid
CARBON_INTENSITY = 0.233   # g/Wh  →  0.000233 g/J (÷ 3600)

# NeuralEcoNet v2 inference overhead (ms per 1024×1024 frame, CPU)
NEURAL_OVERHEAD_MS = 18.0


def render_time_ms(samples, width, height, complexity, use_eco=False):
    base     = 0.0000095
    pixels   = width * height
    eff_spp  = (2 + samples * 0.12) if use_eco else samples
    raw_ms   = base * eff_spp * pixels * complexity
    overhead = NEURAL_OVERHEAD_MS if use_eco else 0.0
    return round(raw_ms + overhead, 3)


def power_watts(samples, complexity, use_eco=False):
    eff_spp   = (2 + samples * 0.12) if use_eco else samples
    base_w    = 28.0 if use_eco else 38.0   # neural uses GPU more efficiently
    dynamic_w = 0.7 * eff_spp + 2.8 * complexity
    return round(base_w + dynamic_w, 2)


def energy_joules(power_w, time_ms):
    return round(power_w * (time_ms / 1000.0), 5)


def fps(time_ms):
    if time_ms <= 0:
        return 0.0
    return round(1000.0 / time_ms, 2)


def co2_grams(energy_j):
    """g CO₂  (energy_j × carbon_intensity_per_joule)."""
    return round(energy_j * (CARBON_INTENSITY / 3600.0), 8)


def pue_overhead(energy_j, pue=1.4):
    """Data-centre PUE multiplier (cooling + infra overhead)."""
    return round(energy_j * pue, 5)


def energy_summary(samples, width, height, complexity, use_eco):
    t   = render_time_ms(samples, width, height, complexity, use_eco)
    pw  = power_watts(samples, complexity, use_eco)
    ej  = energy_joules(pw, t)
    f   = fps(t)
    co2 = co2_grams(ej)
    return {
        "render_time_ms": t,
        "power_w":        pw,
        "energy_j":       ej,
        "fps":            f,
        "co2_g":          co2,
        "effective_spp":  (2 + samples * 0.12) if use_eco else samples,
    }
