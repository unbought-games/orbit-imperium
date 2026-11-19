---
id: browser-journey-gate
title: More focused browser checks
date: '2026-11-19'
---

We moved game rules and timing checks closer to the code that owns them. The browser still follows a player through actions that depend on the whole game, like returning to a fleet review with Back or recovering an order after its reply was lost. Contributors can run those journeys with `make test-journeys` and check individual controls with `make test-components`.
