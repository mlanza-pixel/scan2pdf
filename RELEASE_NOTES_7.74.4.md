# DocuScan Pro 7.74.4 — repeated cache and reload regression

- Device Self-Test now offers 0, 10, 20, or 100 sequential cache/resource consistency cycles. Each cycle retrieves five application resources, alternating default and no-store fetch modes, and checks for missing/stale/changed responses. Results and timings are exported in JSON (`cacheRepeat`). This **does not reload the app**.
- A separate GitHub Actions workflow `cache-repeat-regression.yml` runs actual browser reloads in isolated shards: desktop 10/20/100, emulated iPhone 10, emulated iPad 10. Each shard retains JSON evidence and failure screenshots.
- Service worker cache version bumped to `v7-74-4-repeat-cache-tests` to ensure fresh shell caching after deployment.
- Neither check proves behavior on physical iOS Safari. Repeated reloads do not guarantee detection of every stale-cache or offline bug. Physical iPad/iPhone verification remains necessary.
- Existing v7.74.3 mobile layout corrections and v7.74.2 workflow shards are retained.
