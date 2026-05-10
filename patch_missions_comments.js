const fs = require('fs');
let content = fs.readFileSync('src/prog/missions.js', 'utf-8');

const regex = /const bucketCompletedSet = new Set\(bucket\.completed\);\n  const bucketRewardedSet = new Set\(bucket\.rewarded\);/;

content = content.replace(regex, `// ⚡ Bolt: Use a Set for O(1) membership lookups to avoid O(N*M) scaling when iterating over entries.
  const bucketCompletedSet = new Set(bucket.completed);
  const bucketRewardedSet = new Set(bucket.rewarded);`);

fs.writeFileSync('src/prog/missions.js', content, 'utf-8');
console.log('patched comments');
