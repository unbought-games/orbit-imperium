---
id: analytics-identification-retries
title: Analytics identification retries
date: '2026-11-12T03:54:00Z'
---

We've fixed analytics identification retries being treated as service failures after the daily limit was reached. Existing records can be reused, and requests for new records receive a rate-limit response when necessary.
