# ⚡ Bolt Learnings

* When optimizing independent network operations like database transactions, use `Promise.all` to execute them concurrently instead of sequentially using a `for` loop.
* This is especially impactful in rate limiting scenarios where multiple independent buckets (e.g., IP address and Session ID) are checked per request.
* In Node.js, `performance.now()` from `perf_hooks` (or globally available in recent versions) is an easy way to measure baseline and improved execution times for synchronous/asynchronous blocks.
* Firestore's `runTransaction` execution time includes network RTT, meaning sequential transactions compound latency significantly, making concurrent execution highly preferable.
