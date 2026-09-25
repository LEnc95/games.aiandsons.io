const fs = require('fs');
let code = fs.readFileSync('tests/shop-items.integration.test.mjs', 'utf8');

code = code.replace("if (entry.name === '.git') continue;", "if (entry.name === '.git' || entry.name === 'node_modules') continue;");

fs.writeFileSync('tests/shop-items.integration.test.mjs', code);
