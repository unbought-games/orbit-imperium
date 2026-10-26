# Fusion Reactor

Fusion Reactor is a planet resource building requiring local Deuterium Synthesizer
5 and player Energy Technology 3. Level one costs 900 metal, 360 crystal and 180
deuterium; costs grow by 9/5 per level. Normal construction, demolition, fields,
Robotics acceleration and cancellation rules apply.

At level L, Energy Technology ET, requested fraction p and economy speed s:

- Fully fueled energy: `p * 30 * L * (21/20 + ET/100)^L`.
- Fully fueled deuterium/hour: `s * p * 10 * L * (11/10)^L`.
- Energy Technology changes energy output only; economy speed scales fuel and
  resource production, never energy.

The setting accepts 0–100% in 10% steps. Effective fuel utilization is separate
from the saved setting. At zero deuterium, the reactor automatically throttles to
sustainable output. With external supply E, full requested fusion supply F,
configured mine demand Q, full-power synthesizer production A and requested fuel B,
choose `u=min(1,A/B)` and, when `B*Q>A*F`, also limit to
`A*E/(B*Q-A*F)`. With no external power, no fuel demand or no mine demand, duty is
zero. A fuel delivery or external power can restart it. This zero-fuel policy is
an intentionally selected game rule: it was originally a guessed fallback,
subsequently approved by the owner, not verified historical OGame behavior.

Settlement preserves gross production and fuel consumption separately. Above the
deuterium cap, fuel continues consuming stock while synthesis is suppressed. At
the cap, simultaneous synthesis may replace consumed fuel. At zero, sustainable
power changes all mines' production. Calculations jump between regimes, integrate
fractional boundary milliseconds exactly, then floor carried balances once at the
integer millisecond boundary. Reading frequently and staying offline produce the
same checkpoint. No derived production rate or effective duty is persisted.

The UI shows energy, actual fuel use, net deuterium and fuel limitation. Building
previews use current stock and saved settings. Client extrapolation stops at the
next fuel/storage boundary until an authoritative refresh supplies the new rates.

## Deploy and configure

Fresh `orbit setup` / `orbit universe create` worlds include Fusion Reactor.
Existing worlds retain their current rules until explicitly upgraded. Deploy the
supporting binary to every API, worker and operator process first, then run:

```sh
orbit rules upgrade --universe <uuid> --dry-run
orbit rules upgrade --universe <uuid>
```

The built-in upgrade adds the reviewed definition, prerequisites and production
rules. It settles the old economy and initializes Fusion Reactor level zero on
existing bodies atomically. Repeating it is a no-op. Customized costs, production
rules or disabled content produce explicit conflicts; disabled prerequisites are
rejected. Fusion requires the standard zero background deuterium income; an
export with nonzero background deuterium is rejected because its startup behavior
is outside the selected fuel policy. Use the existing `rules export`, `rules diff` and `rules apply` flow for
intentional customizations. Retain definitions for existing reactors when disabling
new construction. No new environment variable, schema migration or Node preparation
script is required. See [rules updates](rules-updates.md) for pending activation,
rollback and multi-instance deployment constraints.
