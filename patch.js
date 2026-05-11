const fs = require('fs');
let code = fs.readFileSync('api/stripe/_family-store.js', 'utf8');

code = code.replace(
`      accounts: new Map(),
      invites: new Map(),
      emails: new Map(),
    };`,
`      accounts: new Map(),
      invites: new Map(),
      emails: new Map(),
      userToAccount: new Map(),
    };`
);

code = code.replace(
`  for (const rawAccount of memoryState.accounts.values()) {
    const account = normalizeFamilyAccount(rawAccount);
    if (account.memberUserIds.includes(normalizedUserId)) {
      return account;
    }
  }
  return null;`,
`  const accountId = memoryState.userToAccount.get(normalizedUserId);
  if (accountId) {
    return getMemoryAccountById(accountId);
  }
  return null;`
);

code = code.replace(
`  if (isFirestoreFamilyStoreEnabled()) {
    await getFamilyCollections().accounts.doc(normalizedId).set(next, { merge: true });
  } else {
    memoryState.accounts.set(normalizedId, next);
  }`,
`  if (isFirestoreFamilyStoreEnabled()) {
    await getFamilyCollections().accounts.doc(normalizedId).set(next, { merge: true });
  } else {
    const oldAccount = memoryState.accounts.get(normalizedId);
    if (oldAccount && Array.isArray(oldAccount.memberUserIds)) {
      for (const uid of oldAccount.memberUserIds) {
        if (memoryState.userToAccount.get(uid) === normalizedId) {
          memoryState.userToAccount.delete(uid);
        }
      }
    }
    memoryState.accounts.set(normalizedId, next);
    if (Array.isArray(next.memberUserIds)) {
      for (const uid of next.memberUserIds) {
        memoryState.userToAccount.set(uid, normalizedId);
      }
    }
  }`
);

code = code.replace(
`  memoryState.accounts.clear();
  memoryState.invites.clear();
  memoryState.emails.clear();`,
`  memoryState.accounts.clear();
  memoryState.invites.clear();
  memoryState.emails.clear();
  memoryState.userToAccount.clear();`
);

fs.writeFileSync('api/stripe/_family-store.js', code);
