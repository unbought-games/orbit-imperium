"""Offline, interval-certified G06 field weights; live gameplay uses integers only."""
from fractions import Fraction as Q
from hashlib import sha256
from pathlib import Path

# Position, low, center, high, sigma numerator, denominator.
PROFILE = [
    (1,95,100,108,26,10), (2,97,103,110,33,10), (3,98,118,139,97,10),
    (4,123,164,210,87,6), (5,148,179,215,67,6), (6,148,194,239,91,6),
    (7,141,193,242,101,6), (8,163,208,248,85,6), (9,155,197,243,88,6),
    (10,151,188,225,74,6), (11,139,172,205,66,6), (12,134,154,180,83,10),
    (13,107,115,122,32,10), (14,81,86,93,23,10), (15,65,69,74,19,10),
]

def weight(x):
    # exp(x) lies between the partial sum and that sum plus a geometric
    # upper bound on its positive Taylor tail. Inversion bounds exp(-x).
    if x == 0:
        return 10**12
    term = total = Q(1)
    n = 0
    while True:
        nxt = term * x / (n + 1)
        if n + 2 > x:
            upper = total + nxt / (1 - x / (n + 2))
            low_floor = (10**12 / upper).__floor__()
            high_floor = (10**12 / total).__floor__()
            if low_floor == high_floor:
                return low_floor
        term = nxt
        total += term
        n += 1

rows = []
for position, low, center, high, numerator, denominator in PROFILE:
    weights = [weight(Q((f-center)**2 * denominator**2, 2*numerator**2)) for f in range(low, high+1)]
    rows.append(f'{position}:' + ','.join(map(str, weights)) + '\n')
artifact = ''.join(rows)
assert sha256(artifact.encode()).hexdigest() == 'e8d8faf1432c24306a72f221172b80f108d7eb191f874dc365487a032f106654'
if __name__ == '__main__':
    Path(__file__).resolve().parent.parent.joinpath('rules/content/colony-weights-v1.txt').write_text(artifact)
