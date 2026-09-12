import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { AVATAR_EMOJI, DEFAULT_AVATAR_EMOJI, handleEmoji, isAvatarEmoji } from "../src/social/avatars.js";

const ROOT = process.cwd();
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), "utf8");

test("homepage menu exposes Party Mode and join flow exposes the shared avatar catalog", () => {
  const home = read("index.html");
  const html = read("party", "index.html");
  const app = read("party", "app.js");
  assert.match(home, /href="\/party\/"[^>]*>Party Mode<\/a>/);
  assert.match(html, /<fieldset class="avatar-picker">[\s\S]*<legend>Choose your avatar<\/legend>/);
  assert.match(html, /id="avatarOptions"/);
  assert.equal(AVATAR_EMOJI.length, 16);
  assert.equal(DEFAULT_AVATAR_EMOJI, "🦊");
  assert.equal(new Set(AVATAR_EMOJI).size, 16);
  assert.ok(AVATAR_EMOJI.every(isAvatarEmoji));
  assert.equal(handleEmoji("Cade"), handleEmoji("Cade"));
  assert.match(app, /aiandsons-party-avatar/);
  assert.match(app, /playerAvatar: state\.playerAvatar/);
});

test("party protocol and every shared-screen renderer carry avatars", () => {
  const client = read("src", "net", "multiplayerClient.js");
  const party = read("party", "app.js");
  const turbo = read("turbotilt", "game.js");
  const crowd = read("crowdshift", "game.js");
  assert.match(client, /playerAvatar: this\.options\.playerAvatar \|\| undefined/);
  assert.match(party, /payload\.playerAvatar/);
  assert.match(party, /player\.avatar/);
  assert.match(party, /ballot\.playerAvatar/);
  assert.match(turbo, /player\.avatar/);
  assert.match(crowd, /p\.avatar/);
});
