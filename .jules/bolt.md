## Performance Learnings

- When iterating over an array to perform multiple asynchronous I/O operations (like database fetches and saves) per element, replacing the `for...of` loop with a `Promise.all` combined with `.map` significantly improves execution time by running the operations concurrently instead of sequentially.
- Node.js concurrency is well-suited for this, but if the array size grows large, one should be mindful of connection limits or rate limits. In the context of a family account, the number of members is naturally bounded and relatively small (e.g. up to 10), making `Promise.all` safe and very effective.
