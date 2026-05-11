const fs = require('fs');
let code = fs.readFileSync('api/stripe/_shared.js', 'utf8');

code = code.replace(
`  if (!secretKey) return null;
  if (!cachedStripeClient) {
    cachedStripeClient = new Stripe(secretKey);
  }
  return cachedStripeClient;`,
`  if (!secretKey) return null;
  if (!cachedStripeClient || cachedStripeClient._cachedKey !== secretKey) {
    cachedStripeClient = new Stripe(secretKey);
    cachedStripeClient._cachedKey = secretKey;
  }
  return cachedStripeClient;`
);

fs.writeFileSync('api/stripe/_shared.js', code);
