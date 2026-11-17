---
id: structured-logging
title: Structured server diagnostics
date: '2026-11-17'
---

We've added structured server logs to help operators follow an action from admission
to execution. Self-hosters can select error, warn, info or debug with `ORBIT_LOG_LEVEL`
and restart the server to apply it. Info is the default; debug adds selected details
without dumping private game state. Routine metrics remain independent of verbosity.
