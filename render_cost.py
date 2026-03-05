# backend/render_cost.py

def render_time_ms(samples, width, height, complexity):
    base_cost = 0.00001
    pixels = width * height
    time_ms = base_cost * samples * pixels * complexity
    return round(time_ms, 2)


def power_watts(samples, complexity):
    base_power = 40
    dynamic_power = 0.05 * samples * complexity
    return round(base_power + dynamic_power, 2)


def energy_joules(power_w, time_ms):
    return round(power_w * (time_ms / 1000), 4)


def fps(time_ms):
    if time_ms == 0:
        return 0
    return round(1000 / time_ms, 2)


def co2_grams(energy_j):
    return round(energy_j * 0.000233, 6)