const BASE_GAMES = [
  { slug:'clubpenguin-world', name:'Club Penguin World', emoji:'\u{1F427}', scoreHint:'coins', url:'/clubpenguin-world/public/', desc:'Multiplayer social world prototype with rooms, quick chat, and live movement.', earnsCoins:true },
  { slug:'audioagar',      name:'Audio Agar',           emoji:'\u{1F535}', scoreHint:'mass',       url:'/audioagar',     desc:'Audio-first multiplayer orb arena with keyboard movement, spatial cues, and screen-reader status for blind play.', earnsCoins:false, category:'audio-only-blind-accessible', accessibilityTags:['100% playable without sight; keyboard and screen reader friendly'] },
  { slug:'2048',           name:'2048',                emoji:'\u{1F522}', scoreHint:'best tile',  url:'/2048',          desc:'Slide and merge matching tiles until you reach 2048.', earnsCoins:true },
  { slug:'pong',           name:'Pong',                emoji:'\u{1F3D3}', scoreHint:'returns',    url:'/pong',          desc:'Classic paddle game. Play against the computer!', earnsCoins:true },
  { slug:'airhockey',      name:'Air Hockey',          emoji:'\u{1F3D2}', scoreHint:'goals',      url:'/airhockey',     desc:'Drag your striker, bank the puck, and beat the table AI to seven goals.', earnsCoins:true },
  { slug:'skeeball',       name:'Skee-Ball',           emoji:'\u{1F3B3}', scoreHint:'score',      url:'/skeeball',      desc:'Aim, charge, and roll nine arcade balls into high-value scoring rings.', earnsCoins:true },
  { slug:'pool',           name:'Pocket Pool',         emoji:'\u{1F3B1}', scoreHint:'score',      url:'/pool',          desc:'Aim cue shots, bank around the table, and clear three six-ball racks before your shots run out.', earnsCoins:true },
  { slug:'plinko',         name:'Plinko Drop',         emoji:'\u{1FA99}', scoreHint:'score',      url:'/plinko',        desc:'Aim the chute, drop chips through a peg board, nudge falling discs, and beat the target score.', earnsCoins:true },
  { slug:'darts',          name:'Darts 301',           emoji:'\u{1F3AF}', scoreHint:'checkout',   url:'/darts',         desc:'Aim steady throws, score standard dartboard rings, avoid busts, and finish 301 on a double-out checkout.', earnsCoins:true },
  { slug:'snake',          name:'Snake',               emoji:'\u{1F40D}', scoreHint:'length',     url:'/snake',         desc:'Eat food, grow longer, avoid walls and yourself.', earnsCoins:true },
  { slug:'tictactoe',      name:'Tic-Tac-Toe',         emoji:'\u274C',    scoreHint:'wins',       url:'/tictactoe',     desc:'Play vs AI or local 2-player. Try to get 3 in a row!', earnsCoins:true },
  { slug:'rps',            name:'Rock Paper Scissors', emoji:'\u270A',    scoreHint:'streak',     url:'/rps',           desc:'Quick rounds. Build a winning streak!', earnsCoins:true },
  { slug:'prisonersdilemma', name:'Prisoner\'s Dilemma Lab', emoji:'\u2696\uFE0F', scoreHint:'net payoff', url:'/prisonersdilemma', desc:'Run secure repeated Prisoner\'s Dilemma matches against configurable opponent strategies.', earnsCoins:false },
  { slug:'memory',         name:'Memory',              emoji:'\u{1F9E0}', scoreHint:'pairs',      url:'/memory',        desc:'Flip cards to find pairs. Solo or pass-and-play.', earnsCoins:true },
  { slug:'hangman',        name:'Hangman',             emoji:'\u{1FAA2}', scoreHint:'wins',       url:'/hangman',       desc:'Guess letters to solve words. Play against computer or challenge a friend.', earnsCoins:true },
  { slug:'breakout',       name:'Breakout',            emoji:'\u{1F9F1}', scoreHint:'bricks',     url:'/breakout',      desc:'Break all the bricks. Advance levels and score big.', earnsCoins:true },
  { slug:'connect4',       name:'Connect 4',           emoji:'\u{1F7E1}', scoreHint:'wins',       url:'/connect4',      desc:'Connect four in a row. 2-player or vs a simple AI.', earnsCoins:true },
  { slug:'minesweeper',    name:'Minesweeper',         emoji:'\u{1F4A3}', scoreHint:'boards',     url:'/minesweeper',   desc:'Clear the board without detonating mines.', earnsCoins:true },
  { slug:'flappy',         name:'Flappy Bird',         emoji:'\u{1F426}', scoreHint:'distance',   url:'/flappy',        desc:'Tap to fly through pipes. Different skins and worlds.', earnsCoins:true },
  { slug:'dino',           name:'Dino Run',            emoji:'\u{1F996}', scoreHint:'distance',   url:'/dino',          desc:'Endless runner with speed ramp and multipliers.', earnsCoins:true },
  { slug:'doodlejump',     name:'Doodle Jump',         emoji:'\u{1FA82}', scoreHint:'height',     url:'/doodlejump',    desc:'Hop between platforms, climb higher, and avoid falling off-screen.', earnsCoins:true },
  { slug:'spaceinvaders',  name:'Space Invaders',      emoji:'\u{1F47E}', scoreHint:'waves',      url:'/spaceinvaders', desc:'Classic shooter. Clear waves and dodge fire!', earnsCoins:true },
  { slug:'mushroommarch',  name:'Mushroom March',       emoji:'\u{1F344}', scoreHint:'waves',      url:'/mushroommarch', desc:'Defend a moonlit garden, break apart marching rootworms, and survive three mushroom-filled waves.', earnsCoins:true },
  { slug:'frogger',        name:'Frogger',             emoji:'\u{1F438}', scoreHint:'crossings',  url:'/frogger',       desc:'Hop across traffic and rivers to reach safety.', earnsCoins:true },
  { slug:'minigolf',       name:'Pocket Mini Golf',    emoji:'\u26F3',    scoreHint:'low score',  url:'/minigolf',      desc:'Pull back and putt through hazards across 3 compact holes.', earnsCoins:false },
  { slug:'micro-mario',    name:'Micro Mario',         emoji:'\u{1F344}', scoreHint:'coins',      url:'/mario',         desc:'Tiny platformer. Collect coins and reach the flag.', earnsCoins:true },
  { slug:'ski',            name:'Retro Downhill Ski',  emoji:'\u26F7\uFE0F', scoreHint:'distance', url:'/ski',         desc:'Dodge trees and rocks as you race down the mountain!', earnsCoins:true },
  { slug:'homerunderby',   name:'Home Run Derby',      emoji:'\u26BE',    scoreHint:'homeruns',   url:'/homerunderby/', desc:'Time your swing to crush home runs before you rack up 10 outs.', earnsCoins:true },
  { slug:'micro-rc-racer', name:'Micro RC Racer',      emoji:'\u{1F3CE}\uFE0F', scoreHint:'best lap', url:'/microrc',   desc:'Top-down RC dirt racing with tank steering and slippery drifts.', earnsCoins:false },
  { slug:'oregontrail',    name:'Oregon Trail',        emoji:'\u{1F40E}', scoreHint:'miles',      url:'/oregontrail/', desc:'Lead a wagon party across 2,000 miles, ration supplies, and survive trail disasters.', earnsCoins:false },
  { slug:'neonrally',      name:'Neon Rally',          emoji:'\u{1F3C1}', scoreHint:'position',   url:'/neonrally',     desc:'Race AI rivals through neon turns, chain boosts, and finish 3 laps before time runs out.', earnsCoins:true },
  { slug:'pacman',         name:'Pac-Man',             emoji:'\u{1F7E1}', scoreHint:'score',      url:'/pacman',        desc:'Eat pellets, outsmart ghosts, and clear multiple levels.', earnsCoins:true },
  { slug:'pokemon',        name:'Pokemon',             emoji:'\u{1F9E2}', scoreHint:'badges',     url:'/pokemon',       desc:'Build your team, battle trainers, and collect badges.', earnsCoins:true },
  { slug:'tetris',         name:'Tetris',              emoji:'\u{1F9E9}', scoreHint:'lines',      url:'/tetris',        desc:'Rotate, stack, and clear lines as speed ramps up each level.', earnsCoins:true },
  { slug:'asteroids',      name:'Asteroids',           emoji:'\u2604\uFE0F', scoreHint:'waves',   url:'/asteroids',     desc:'Thrust, rotate, and blast drifting asteroids across endless waves.', earnsCoins:true },
  { slug:'missilecommand', name:'Missile Command',      emoji:'\u{1F6E1}\uFE0F', scoreHint:'waves', url:'/missilecommand', desc:'Launch interceptors, catch incoming missiles in blast clouds, and defend every city through escalating waves.', earnsCoins:true },
  { slug:'towerdefense',   name:'Tower Defense',        emoji:'\u{1F3F0}', scoreHint:'waves',      url:'/towerdefense',  desc:'Place Bolt, Frost, and Mortar towers, upgrade defenses, and hold the keep through seven enemy waves.', earnsCoins:true },
  { slug:'skyjoust',       name:'Sky Joust',           emoji:'\u2601\uFE0F', scoreHint:'waves',   url:'/skyjoust',      desc:'Flap through a sky arena, strike rival drones from above, and clear six escalating joust waves.', earnsCoins:true },
  { slug:'bomberman',      name:'Bomberman Lite',      emoji:'\u{1F4A5}', scoreHint:'level',      url:'/bomberman',     desc:'Drop bombs, break crates, clear enemies, and escape each maze.', earnsCoins:true },
  { slug:'treasuremaze',   name:'Treasure Maze',       emoji:'\u{1F48E}', scoreHint:'level',      url:'/treasuremaze',  desc:'Navigate twisting mazes, collect every gem, and escape the guards.', earnsCoins:true },
  { slug:'echolabyrinth',  name:'Echo Labyrinth',      emoji:'\u{1F3A7}', scoreHint:'moves',      url:'/echolabyrinth', desc:'Navigate by sound alone using footsteps, wall thuds, and beacon echoes to find the maze exit.', earnsCoins:false, category:'audio-only-blind-accessible', accessibilityTags:['100% playable without sight; keyboard and screen reader friendly'] },
  { slug:'boxquest',       name:'Box Quest',           emoji:'\u{1F4E6}', scoreHint:'moves',      url:'/boxquest',      desc:'Push crates onto glowing goal pads across multi-level puzzle rooms.', earnsCoins:true },
  { slug:'waterballoon',   name:'Water Balloon Code Duel', emoji:'\u{1F4A7}', scoreHint:'wins',   url:'/waterballoon',  desc:'Two players script moves, pass the device, and watch both turns resolve simultaneously.', earnsCoins:true },
  { slug:'whackamole',     name:'Whack-a-Mole Blitz',  emoji:'\u{1F528}', scoreHint:'score',      url:'/whackamole',    desc:'Race the clock by smashing moles, chaining streaks, and avoiding bomb traps.', earnsCoins:true },
  { slug:'colorcatch',     name:'Color Catch Arcade',  emoji:'\u{1F308}', scoreHint:'score',      url:'/colorcatch',    desc:'Match bucket colors to falling drops, chain combos, and survive all three stages.', earnsCoins:true },
  { slug:'orbitalrescue',  name:'Orbital Rescue',      emoji:'\u{1F6F8}', scoreHint:'rescues',    url:'/orbitalrescue', desc:'Pilot a rescue craft, recover stranded pilots, and survive escalating debris waves.', earnsCoins:true },
  { slug:'lightsout',      name:'Lights Out Lab',      emoji:'\u{1F4A1}', scoreHint:'levels',     url:'/lightsout',     desc:'Flip cross-neighbor tiles, clear every light, and solve escalating puzzle boards.', earnsCoins:true },
  { slug:'glowgrid',       name:'Glow Grid',           emoji:'\u2728',    scoreHint:'solves',     url:'/glowgrid',      desc:'Place bulbs, satisfy numbered wall clues, and light every corridor without crossing beams.', earnsCoins:true },
  { slug:'looptrail',      name:'Loop Trail',          emoji:'\u27B0',    scoreHint:'loops',      url:'/looptrail',     desc:'Draw one continuous loop around numbered cells, satisfy every edge clue, and avoid branches or broken trails.', earnsCoins:true },
  { slug:'vialsort',       name:'Vial Sort',           emoji:'\u{1F9EA}', scoreHint:'moves',      url:'/vialsort',      desc:'Pour matching liquid layers between glass vials, sort every color into pure tubes, and clear five lab shelves.', earnsCoins:true },
  { slug:'bridgeislands',  name:'Bridge Islands',      emoji:'\u{1F309}', scoreHint:'bridges',    url:'/bridgeislands', desc:'Draw one or two bridges between numbered islands, satisfy every clue, and connect each chart into one network.', earnsCoins:true },
  { slug:'samegame',       name:'SameGame',            emoji:'\u{1F9E9}', scoreHint:'clusters',   url:'/samegame',      desc:'Remove connected color clusters, drop columns into place, and clear five seeded puzzle boards before options dry up.', earnsCoins:true },
  { slug:'pyramidhopper',   name:'Pyramid Hopper',      emoji:'\u{1F53A}', scoreHint:'tiles',      url:'/pyramidhopper', desc:'Hop across an isometric pyramid, light every cube, dodge rolling sparks, and clear three arcade boards.', earnsCoins:true },
  { slug:'pinball',        name:'Neon Pinball Rush',   emoji:'\u{1F3B0}', scoreHint:'score',      url:'/pinball',       desc:'Launch, flip, and chain bumper combos in a neon table run before your balls run out.', earnsCoins:true },
  { slug:'skywire',        name:'Skywire Sprint',      emoji:'\u{1F6F9}', scoreHint:'distance',   url:'/skywire',       desc:'Swap lanes, dodge drone traffic, and dash through hazards to finish a high-speed skyway run.', earnsCoins:true },
  { slug:'starfielddodger', name:'Starfield Dodger',   emoji:'\u{1F680}', scoreHint:'score',      url:'/starfielddodger', desc:'Slide across lanes, dodge meteor storms, and collect stars to survive the jump run.', earnsCoins:true },
  { slug:'simonsays',      name:'Simon Says Spectrum', emoji:'\u{1F3A8}', scoreHint:'round',      url:'/simonsays',     desc:'Memorize flashing color sequences, repeat them perfectly, and survive as patterns get longer.', earnsCoins:true },
  { slug:'reactiongrid',   name:'Reaction Grid',       emoji:'\u{1F4F6}', scoreHint:'blocks',     url:'/reactiongrid',  desc:'Rotate your shield, block incoming bolts, and survive the full reactor defense cycle.', earnsCoins:true },
  { slug:'gravityswitch',  name:'Gravity Switch',      emoji:'\u{1F9F2}', scoreHint:'distance',   url:'/gravityswitch', desc:'Flip between floor and ceiling lanes, dodge barriers, and chain star pickups through a 90-second run.', earnsCoins:true },
  { slug:'orbburst',       name:'Orb Burst',           emoji:'\u{1F52E}', scoreHint:'score',      url:'/orbburst',      desc:'Strafe, blast descending orbs, chain combo streaks, and survive a 75-second arena run.', earnsCoins:true },
  { slug:'lasermaze',      name:'Laser Maze Dash',     emoji:'\u{1F52B}', scoreHint:'score',      url:'/lasermaze',     desc:'Thread through shifting laser gates, collect glowing cores, and survive a full-speed 70-second maze run.', earnsCoins:true },
  { slug:'moonlander',     name:'Moon Lander Patrol',  emoji:'\u{1F6F0}\uFE0F', scoreHint:'sector', url:'/moonlander',  desc:'Balance thrusters, conserve fuel, and complete safe landings across three moon sectors.', earnsCoins:true },
  { slug:'cometcourier',   name:'Comet Courier',       emoji:'\u{1F6F8}', scoreHint:'served',     url:'/cometcourier',  desc:'Manage station demand, deliver cargo, and keep every orbital port supplied before overload.', earnsCoins:true },
  { slug:'riftdrifter',    name:'Rift Drifter',        emoji:'\u{1F30C}', scoreHint:'shards',     url:'/riftdrifter',   desc:'Pilot a zero-g skiff, rotate and thrust through anomalies, and collect shards before the rift closes.', earnsCoins:true },
  { slug:'circuitpath',    name:'Circuit Path',        emoji:'\u{1F5A7}', scoreHint:'nodes',      url:'/circuitpath',   desc:'Collect data nodes, dodge sentry sweeps, and route your bot to the uplink before time runs out.', earnsCoins:true },
  { slug:'signalstack',    name:'Signal Stack',        emoji:'\u{1F4E1}', scoreHint:'links',      url:'/signalstack',   desc:'Rotate relay tiles, route signal paths, and power every receiver before the stack timer expires.', earnsCoins:true },
  { slug:'linerider',      name:'Line Rider',          emoji:'\u270F\uFE0F', scoreHint:'distance', url:'/linerider',   desc:'Draw lines to create a track for the sled to ride on.', earnsCoins:true },
  { slug:'vaultrunner',    name:'Vault Runner',        emoji:'\u{1F510}', scoreHint:'stages',     url:'/vaultrunner',   desc:'Crack rotating tumbler codes across multiple vault stages before alarm pressure hits critical.', earnsCoins:true },
  { slug:'chromeshift',    name:'Chrome Shift',        emoji:'\u{1F539}', scoreHint:'territory',  url:'/chromeshift',   desc:'Flood the board by shifting chrome colors and capture every tile before moves run out.', earnsCoins:true },
  { slug:'trailblazer',    name:'Trailblazer Grid',    emoji:'\u{1F9ED}', scoreHint:'painted',    url:'/trailblazer',   desc:'Paint the arena, dodge patrol drones, and capture enough tiles before time runs out.', earnsCoins:true },
  { slug:'portpilot',      name:'Port Pilot',          emoji:'\u{2693}',  scoreHint:'delivered',  url:'/portpilot',     desc:'Rotate conveyor nodes and route color-coded cargo pods into matching docks before integrity collapses.', earnsCoins:true },
  { slug:'beatforge',      name:'Beat Forge',          emoji:'\u{1F3B5}', scoreHint:'streak',     url:'/beatforge',     desc:'Time lane hits on the strike line, chain streaks, and keep crowd health alive through a full rhythm set.', earnsCoins:true },
  { slug:'beatrail',       name:'Beat Rail',           emoji:'\u{1F3BC}', scoreHint:'accuracy',   url:'/beatrail',      desc:'Accessible 3-lane rhythm warmup with spoken cues, generous timing, and optional practice mode.', earnsCoins:false, category:'audio-only-blind-accessible', accessibilityTags:['100% playable without sight; keyboard and screen reader friendly'] },
  { slug:'bytebloom',      name:'Byte Bloom',          emoji:'\u{1FAB4}', scoreHint:'bloom',      url:'/bytebloom',     desc:'Plant pulse-seeds, spread healthy bloom, and contain blight pockets before your timer expires.', earnsCoins:true },
  { slug:'branchingaudio', name:'Branching Audio Adventure', emoji:'\u{1F916}', scoreHint:'endings', url:'/branchingaudio', desc:'Interactive fiction where you are an AI agent navigating a client incident with narrated branching choices.', earnsCoins:false, category:'audio-only-blind-accessible', accessibilityTags:['100% playable without sight; keyboard and screen reader friendly'] },
  { slug:'gemswap',        name:'Gem Swap Blitz',      emoji:'\u{1F48E}', scoreHint:'score',      url:'/gemswap',       desc:'Swap adjacent gems, trigger cascades, and beat the target score before the round timer expires.', earnsCoins:true },
  { slug:'hexharvest',     name:'Hex Harvest',         emoji:'\u{1F33E}', scoreHint:'harvest',    url:'/hexharvest',    desc:'Grow and harvest a living field while clearing spreading weeds before soil health collapses.', earnsCoins:true },
  { slug:'wordweave',      name:'Word Weave',          emoji:'\u{1F4DD}', scoreHint:'words',      url:'/wordweave',     desc:'Trace adjacent letter paths, complete target words, and build streaks before the timer expires.', earnsCoins:true },
  { slug:'letterlock',     name:'Letter Lock',         emoji:'\u{1F510}', scoreHint:'solves',     url:'/letterlock',    desc:'Crack five-letter lock words by reading green, gold, and gray tile clues before six guesses run out.', earnsCoins:true },
  { slug:'wordsearch',     name:'Word Search',         emoji:'\u{1F50E}', scoreHint:'words',      url:'/wordsearch',    desc:'Trace hidden words across themed letter grids with hints, undo, and diagonal searches.', earnsCoins:true },
  { slug:'setmatch',       name:'Set Match',           emoji:'\u{1F0CF}', scoreHint:'sets',       url:'/setmatch',      desc:'Find three-card pattern sets where every feature is all matching or all different before the round timer expires.', earnsCoins:true },
  { slug:'crazyeights',    name:'Crazy Eights',        emoji:'8\uFE0F\u20E3', scoreHint:'score',  url:'/crazyeights',   desc:'Match rank or suit, call wild eights, draw through the deck, and empty your hand before three table rivals.', earnsCoins:true },
  { slug:'twentyone',      name:'Twenty-One Table',     emoji:'21',        scoreHint:'score',      url:'/twentyone',     desc:'Build card hands near 21, choose hit, stand, or double, and beat the dealer across a six-hand points table with no betting.', earnsCoins:true },
  { slug:'flowlines',      name:'Flow Lines',          emoji:'\u{1F500}', scoreHint:'paths',      url:'/flowlines',     desc:'Connect matching color terminals, fill every grid tile, and keep every flowing path from crossing.', earnsCoins:true },
  { slug:'tripeaks',       name:'Tri Peaks Solitaire', emoji:'\u{1F0CF}', scoreHint:'cleared',    url:'/tripeaks',      desc:'Clear three overlapping card peaks by playing available cards one rank above or below the waste pile before the stock runs dry.', earnsCoins:true },
  { slug:'diceforge',      name:'Dice Forge',          emoji:'\u{1F3B2}', scoreHint:'score',      url:'/diceforge',     desc:'Draft dice with hold-and-reroll strategy, then lock each scoring category before the forge timer expires.', earnsCoins:true },
  { slug:'yachtdice',      name:'Yacht Dice',          emoji:'\u{1F3B2}', scoreHint:'score',      url:'/yachtdice',     desc:'Roll five dice, hold the best values, and fill a classic scorecard across upper bonus, straights, full house, yacht, and chance rows.', earnsCoins:true },
  { slug:'shutthebox',     name:'Shut the Box',        emoji:'\u{1F3B2}', scoreHint:'low score',  url:'/shutthebox',    desc:'Roll dice, close numbered tiles that match each sum, and chase the lowest remaining score across three box layouts.', earnsCoins:true },
  { slug:'keystrike',      name:'Keystrike Command',   emoji:'\u{2328}\uFE0F', scoreHint:'score', url:'/keystrike',     desc:'Type matching signal keys to intercept incoming drones before hull integrity is lost.', earnsCoins:true },
  { slug:'pulseparry',     name:'Pulse Parry',         emoji:'\u{1F6E1}\uFE0F', scoreHint:'score', url:'/pulseparry',    desc:'Rotate your shield, time pulse bursts, and parry incoming drones before the core breaks.', earnsCoins:true },
  { slug:'magnetrail',     name:'Magnet Rail',         emoji:'\u{1F9F2}', scoreHint:'delivered',  url:'/magnetrail',    desc:'Toggle magnetic rails, reroute incoming pods, and deliver them to matching bays before shields collapse.', earnsCoins:true },
  { slug:'loomlock',       name:'Loom Lock',           emoji:'\u{1F5DD}\uFE0F', scoreHint:'beacons', url:'/loomlock',    desc:'Jump in knight patterns, dodge sentinel scan lanes, and collect enough beacons before the lock collapses.', earnsCoins:true },
  { slug:'tidetower',      name:'Tide Tower',          emoji:'\u{1F30A}', scoreHint:'integrity',  url:'/tidetower',     desc:'Manage floodgates, redirect surges, and keep Tide Tower standing until the storm expires.', earnsCoins:true },
  { slug:'starlattice',    name:'Star Lattice',        emoji:'\u{1F31F}', scoreHint:'delivered',  url:'/starlattice',   desc:'Place mirror tiles, route color pulses, and hit matching docks before your shield collapses.', earnsCoins:true },
  { slug:'reactorrelay',   name:'Reactor Relay',       emoji:'\u{1F50C}', scoreHint:'stabilized', url:'/reactorrelay',  desc:'Rotate relay tiles, route energy packets, and hit matching docks before reactor shielding collapses.', earnsCoins:true },
  { slug:'prismpipeline',  name:'Prism Pipeline',      emoji:'\u{1F9EA}', scoreHint:'stabilized', url:'/prismpipeline', desc:'Cycle prism relays, route photon packets, and stabilize the grid before containment fails.', earnsCoins:true },
  { slug:'glacierguard',   name:'Glacier Guard',       emoji:'\u{1F9CA}', scoreHint:'melted',     url:'/glacierguard',  desc:'Move the harbor turret, melt incoming glaciers, and keep your shield intact until storm timeout.', earnsCoins:true },
  { slug:'stormvault',     name:'Storm Vault',         emoji:'\u26A1',    scoreHint:'charge',     url:'/stormvault',   desc:'Match rod polarity to incoming strikes, charge the vault, and keep the shield online until the storm passes.', earnsCoins:true },
  { slug:'driftdredger',   name:'Drift Dredger',       emoji:'\u{1F6A4}', scoreHint:'salvage',    url:'/driftdredger', desc:'Pilot a salvage sub, collect drifting scrap, and dodge sea mines before your hull fails.', earnsCoins:true },
  { slug:'solarskiff',     name:'Solar Skiff',         emoji:'\u{1F6F6}', scoreHint:'shards',     url:'/solarskiff',   desc:'Trim your sail with shifting solar winds, collect star shards, and dodge flare swarms before integrity fails.', earnsCoins:true },
  { slug:'cindercrash',    name:'Cinder Crash',        emoji:'\u{1F525}', scoreHint:'cores',      url:'/cindercrash',  desc:'Steer a magma skimmer through ash squalls, recover ember cores, and dodge cinder bursts before hull integrity fails.', earnsCoins:true },
  { slug:'orbitorchard',   name:'Orbit Orchard',       emoji:'\u{1F34F}', scoreHint:'fruit',      url:'/orbitorchard', desc:'Steer around nested orbit rings, harvest glowing fruit, and dodge thorn drones before vitality runs out.', earnsCoins:true },
  { slug:'emberwatch',     name:'Ember Watch',         emoji:'\u{1F6A8}', scoreHint:'rescues',    url:'/emberwatch',   desc:'Guide a rapid-response skimmer, rescue trapped residents, and extinguish spreading fires before district danger hits critical.', earnsCoins:true },
  { slug:'cloudclimber',   name:'Cloud Climber',       emoji:'\u{1F388}', scoreHint:'lanterns',   url:'/cloudclimber', desc:'Pilot a balloon courier through storm lanes, rescue drifting lanterns, and keep your hull intact before time expires.', earnsCoins:true },
  { slug:'reefrunner',     name:'Reef Runner',         emoji:'\u{1F30A}', scoreHint:'beacons',    url:'/reefrunner',   desc:'Pilot a reef skimmer through coral gates, ping sonar to charge lost beacons, and manage oxygen while jellyfish drift through the current.', earnsCoins:true },
  { slug:'codebreaker',    name:'Codebreaker Grid',    emoji:'\u{1F510}', scoreHint:'solves',     url:'/codebreaker',  desc:'Deduce a hidden four-color code by reading exact and near-match clues before the attempt grid fills.', earnsCoins:true },
  { slug:'solitaire',      name:'Klondike Solitaire',  emoji:'\u{1F0CF}', scoreHint:'foundations', url:'/solitaire',     desc:'Deal a classic Klondike tableau, draw through the stock, stack alternating colors, and build each suit foundation from ace to king.', earnsCoins:true },
  { slug:'freecell',       name:'FreeCell Solitaire',  emoji:'\u{1F0CF}', scoreHint:'foundations', url:'/freecell',      desc:'Use four free cells to rearrange an open tableau, build alternating runs, and complete every suit foundation from ace to king.', earnsCoins:true },
  { slug:'fifteenpuzzle',  name:'Fifteen Puzzle',      emoji:'\u{1F9E9}', scoreHint:'moves',      url:'/fifteenpuzzle', desc:'Slide numbered tiles into the empty space, restore the board in order, and chase lower move counts across 3x3, 4x4, and 5x5 puzzles.', earnsCoins:true },
  { slug:'battleship',     name:'Battleship',           emoji:'\u{1F6A2}', scoreHint:'sunk',       url:'/battleship',   desc:'Fire across a hidden 10 by 10 fleet grid, track hits and misses, use limited scans, and sink every enemy ship before the AI finds yours.', earnsCoins:true },
  { slug:'dotsandboxes',   name:'Dots and Boxes',       emoji:'\u25A6',    scoreHint:'boxes',      url:'/dotsandboxes', desc:'Draw edges between dots, close boxes to keep the turn, and outscore the AI before the shared grid fills.', earnsCoins:true },
  { slug:'reversi',        name:'Reversi',              emoji:'\u25D0',    scoreHint:'discs',      url:'/reversi',      desc:'Place black discs, bracket white lines, flip the board in your favor, and outscore the AI by controlling corners.', earnsCoins:true },
  { slug:'checkers',       name:'Checkers',            emoji:'\u26AB',    scoreHint:'captures',   url:'/checkers',     desc:'Play red against an AI opponent with forced captures, multi-jumps, kinging, hints, and undo support.', earnsCoins:true },
  { slug:'pegsolitaire',   name:'Peg Solitaire',       emoji:'\u26AA',    scoreHint:'pegs',       url:'/pegsolitaire', desc:'Jump pegs over adjacent pegs into empty holes, clear each board, and chase the one-peg finish.', earnsCoins:true },
  { slug:'towerhanoi',     name:'Tower of Hanoi',      emoji:'\u{1F5FC}', scoreHint:'moves',      url:'/towerhanoi',   desc:'Move stacked discs across three rods, solve each tower in the fewest moves, and never place a larger disc on a smaller one.', earnsCoins:true },
  { slug:'nimgrove',       name:'Nim Grove',           emoji:'\u{1FAA8}', scoreHint:'rounds',     url:'/nimgrove',     desc:'Remove stones from one grove pile at a time, outwit a deterministic AI, and master normal or misere Nim.', earnsCoins:true },
  { slug:'mancala',        name:'Mancala',             emoji:'\u{1F7E4}', scoreHint:'stones',     url:'/mancala',      desc:'Sow stones around the board, chain extra turns, and capture across the rows to fill your store before the AI does.', earnsCoins:true },
  { slug:'backgammon',     name:'Backgammon',          emoji:'\u{1F3B2}', scoreHint:'points',     url:'/backgammon',   desc:'Roll dice, hit exposed blots, enter from the bar, and bear off every checker before the AI does.', earnsCoins:true },
  { slug:'chess',          name:'Chess',               emoji:'\u265F\uFE0F', scoreHint:'checkmates', url:'/chess',       desc:'Play a complete chess match against a tactical AI with castling, en passant, promotion, hints, and undo.', earnsCoins:true },
  { slug:'gomokugrid',     name:'Gomoku Grid',         emoji:'\u26AB',    scoreHint:'wins',       url:'/gomokugrid',   desc:'Place stones on a 15 by 15 board, build five in a row, and outread the AI before the timer expires.', earnsCoins:true },
  { slug:'sudokusprint',   name:'Sudoku Sprint',       emoji:'\u{1F9EE}', scoreHint:'solves',     url:'/sudokusprint', desc:'Solve Sudoku boards with notes, hints, and a mistake limit before the puzzle timer expires.', earnsCoins:true },
  { slug:'potionpantry',   name:'Potion Pantry',       emoji:'\u{1F9EA}', scoreHint:'orders',     url:'/potionpantry', desc:'Mix ingredient drops into requested potions, manage bubbling patience, and serve each order before the pantry closes.', earnsCoins:true },
  { slug:'marblecircuit',  name:'Marble Circuit',      emoji:'\u{1F535}', scoreHint:'courses',    url:'/marblecircuit', desc:'Tilt a marble through maze circuits, collect every brass ring, avoid sink holes, and unlock the finish gate before time runs out.', earnsCoins:true },
  { slug:'switchyard',     name:'Switchyard Shuffle',  emoji:'\u{1F686}', scoreHint:'delivered',  url:'/switchyard',    desc:'Flip rail junctions, route colored trains, and deliver each line to the matching platform before safety fails.', earnsCoins:true },
  { slug:'canallock',      name:'Canal Lock',          emoji:'\u{1F6A2}', scoreHint:'delivered',  url:'/canallock',     desc:'Pump lock chambers, match water levels, and guide cargo barges through canal gates before pressure floods the harbor.', earnsCoins:true },
  { slug:'skylinestacker', name:'Skyline Stacker',     emoji:'\u{1F3D9}\uFE0F', scoreHint:'floors', url:'/skylinestacker', desc:'Time sliding floor drops, keep each tower segment aligned, and build the tallest skyline before the stack slips away.', earnsCoins:true },
  { slug:'wobble-drop',    name:'Wobble Drop',         emoji:'\u{1F7E3}', scoreHint:'height',     url:'/wobble-drop',   desc:'Drop pastel physics toys onto a wobbling sky platform, merge matching shapes, and stack as high as possible before anything slips away.', earnsCoins:true },
  { slug:'cranecargo',     name:'Crane Cargo',         emoji:'\u{1F3D7}\uFE0F', scoreHint:'delivered', url:'/cranecargo', desc:'Move a crane trolley, lower the swinging hook, and sort color-coded cargo into matching bays before the shift timer expires.', earnsCoins:true },
  { slug:'nebulacurl',     name:'Nebula Curl',         emoji:'\u{1F94C}', scoreHint:'rings',      url:'/nebulacurl',    desc:'Aim curling comets through gravity wells, cross bonus gates, and settle each shot inside glowing target rings.', earnsCoins:true },
  { slug:'aerocourier',    name:'Aero Courier',        emoji:'\u2708\uFE0F', scoreHint:'delivered', url:'/aerocourier',  desc:'Pilot a glider through wind lanes, collect color-coded parcels, and deliver them to matching rooftop pads before dusk.', earnsCoins:true },
  { slug:'ribboncapture',  name:'Ribbon Capture',      emoji:'\u{1F397}\uFE0F', scoreHint:'claimed', url:'/ribboncapture', desc:'Draw safe ribbons through open space, seal territory, and avoid moving hazards while claiming the grid.', earnsCoins:true },
  { slug:'tangletuner',    name:'Tangle Tuner',        emoji:'\u{1F500}', scoreHint:'untangled',  url:'/tangletuner',   desc:'Swap receiver sockets, untangle crossing signal lines, and tune every pulse board before the timer expires.', earnsCoins:true },
  { slug:'sundialsprint',  name:'Sundial Sprint',      emoji:'\u23F3',    scoreHint:'shards',     url:'/sundialsprint', desc:'Race across a living sundial, collect hourglass shards, and dash through rotating shadows before your light runs out.', earnsCoins:true },
  { slug:'bubbleshooter',  name:'Bubble Shooter',      emoji:'\u{1FAE7}', scoreHint:'score',      url:'/bubbleshooter', desc:'Aim, bank shots, and match colorful bubbles before the ceiling pressure reaches the danger line.', earnsCoins:true },
  { slug:'mosaicmatch',    name:'Mosaic Match',        emoji:'\u{1F5BC}\uFE0F', scoreHint:'match', url:'/mosaicmatch',   desc:'Copy compact color mosaics onto a larger board before the timer or mismatch limit runs out.', earnsCoins:true },
  { slug:'mahjongsolitaire', name:'Mahjong Solitaire', emoji:'\u{1F004}', scoreHint:'tiles',      url:'/mahjongsolitaire', desc:'Match free Mahjong tiles across layered solitaire layouts, using hints, shuffles, and undo to clear the table.', earnsCoins:true },
  { slug:'nonogram',       name:'Nonogram',            emoji:'\u{1F5BC}\uFE0F', scoreHint:'solves', url:'/nonogram',     desc:'Solve picture-logic grids by reading row and column clues, filling hidden squares, and marking safe empty cells.', earnsCoins:true },
  { slug:'tenttrail',      name:'Tent Trail',          emoji:'\u26FA\uFE0F', scoreHint:'trails',    url:'/tenttrail',    desc:'Place tents beside trees, satisfy every row and column clue, and solve each trail without letting tents touch.', earnsCoins:true },
  { slug:'rushhour',       name:'Rush Hour',           emoji:'\u{1F697}', scoreHint:'moves',      url:'/rushhour',     desc:'Slide cars and trucks through a 6 by 6 traffic jam, clearing blockers so the red car can reach the exit.', earnsCoins:true },
  { slug:'jigsaw',         name:'Jigsaw Puzzle',       emoji:'\u{1F5BC}\uFE0F', scoreHint:'pieces', url:'/jigsaw',       desc:'Drag picture pieces into a ghost preview, snap them into place, and complete colorful jigsaw scenes with hints, shuffle, and undo.', earnsCoins:true },
  { slug:'kakuro',         name:'Kakuro',              emoji:'\u2795',    scoreHint:'solves',     url:'/kakuro',       desc:'Fill crossword-style number grids by matching clue sums, avoiding duplicate digits, and using pencil notes, hints, and undo.', earnsCoins:true },
  { slug:'caverncrush',    name:'Cavern Crush',        emoji:'\u26CF\uFE0F', scoreHint:'gems',    url:'/caverncrush',  desc:'Dig through cave dirt, collect enough gems to open the exit, and avoid loose falling rocks.', earnsCoins:true },
  { slug:'calccages',      name:'Calc Cages',          emoji:'\u{1F522}', scoreHint:'solves',     url:'/calccages',    desc:'Fill arithmetic cages with nonrepeating row and column digits while matching every cage target.', earnsCoins:true },
  { slug:'wordladder',     name:'Word Ladder Sprint',  emoji:'\u{1FA9C}', scoreHint:'ladders',    url:'/wordladder',   desc:'Transform one word into another by changing a single letter at each valid vocabulary step.', earnsCoins:true },
  { slug:'dominodraw',     name:'Domino Draw',         emoji:'\u{1F0CF}', scoreHint:'points',     url:'/dominodraw',   desc:'Match domino ends, draw from the boneyard, block the table AI, and race to 50 points.', earnsCoins:true },
  { slug:'inkislands',     name:'Ink Islands',         emoji:'\u{1F3DD}\uFE0F', scoreHint:'solves', url:'/inkislands',   desc:'Shade duplicate numbers, keep inked cells apart, and connect every uninked island across five Hitori-style logic puzzles.', earnsCoins:true },
  { slug:'vistatowers',    name:'Vista Towers',        emoji:'\u{1F3D9}\uFE0F', scoreHint:'solves', url:'/vistatowers',  desc:'Fill skyline tower heights so every row, column, and edge visibility clue lines up across four logic boards.', earnsCoins:true },
  { slug:'futoshiki',      name:'Futoshiki',            emoji:'\u{1F522}', scoreHint:'solves',     url:'/futoshiki',    desc:'Fill inequality logic grids with nonrepeating row and column digits while every greater-than clue stays true.', earnsCoins:true },
  { slug:'blackbox',       name:'Black Box',            emoji:'\u25FC\uFE0F', scoreHint:'atoms',   url:'/blackbox',     desc:'Fire probe rays into a hidden grid, read hits, reflections, and detours, then mark every atom in the black box.', earnsCoins:true },
  { slug:'chronosort',     name:'ChronoSort',           emoji:'\u{1F4C5}', scoreHint:'attempts',   url:'/chronosort',   desc:'Drag five historical events into a daily timeline, read green, yellow, and red feedback, and share your attempt path.', earnsCoins:false },
  { slug:'minicrossword',  name:'Mini Crossword',       emoji:'\u{1F5DE}\uFE0F', scoreHint:'solves', url:'/minicrossword', desc:'Fill compact word-square crossword grids, follow across and down clues, use hints, and solve five bite-size minis.', earnsCoins:true },
  { slug:'fillomino',      name:'Fillomino',            emoji:'\u{1F9E9}', scoreHint:'solves',     url:'/fillomino',    desc:'Fill number grids so every connected region contains exactly as many cells as its number.', earnsCoins:true },
  { slug:'canyonglider',   name:'Canyon Glider',        emoji:'\u{1F6E9}\uFE0F', scoreHint:'rings', url:'/canyonglider', desc:'Race through canyon gates, ride gusts, collect flight rings, and boost to the finish before your hull gives out.', earnsCoins:true },
];

export const GAME_DISCOVERY_CATEGORIES = Object.freeze([
  { key: 'puzzle', label: 'Puzzle' },
  { key: 'arcade', label: 'Arcade' },
  { key: 'word', label: 'Word' },
  { key: 'cards', label: 'Cards' },
  { key: 'sports', label: 'Sports' },
  { key: 'racing', label: 'Racing' },
  { key: 'strategy', label: 'Strategy' },
  { key: 'audio-accessible', label: 'Audio Accessible' },
  { key: 'two-player', label: 'Two Player' },
]);

const DISCOVERY_CATEGORY_KEYS = new Set(GAME_DISCOVERY_CATEGORIES.map(item => item.key));

const DISCOVERY_CATEGORY_GROUPS = Object.freeze({
  puzzle: new Set([
    '2048', 'memory', 'minesweeper', 'boxquest', 'lightsout', 'glowgrid', 'looptrail',
    'vialsort', 'bridgeislands', 'samegame', 'chromeshift', 'signalstack', 'flowlines',
    'fifteenpuzzle', 'pegsolitaire', 'towerhanoi', 'sudokusprint', 'marblecircuit',
    'switchyard', 'canallock', 'wobble-drop', 'tangletuner', 'mosaicmatch', 'mahjongsolitaire',
    'nonogram', 'tenttrail', 'inkislands', 'vistatowers', 'futoshiki', 'blackbox', 'chronosort',
    'minicrossword', 'fillomino', 'rushhour', 'jigsaw', 'kakuro', 'calccages',
  ]),
  arcade: new Set([
    'pong', 'airhockey', 'skeeball', 'plinko', 'snake', 'breakout', 'flappy',
    'dino', 'doodlejump', 'spaceinvaders', 'frogger', 'pacman', 'tetris',
    'asteroids', 'missilecommand', 'skyjoust', 'bomberman', 'whackamole',
    'colorcatch', 'pyramidhopper', 'pinball', 'starfielddodger', 'reactiongrid',
    'gravityswitch', 'orbburst', 'lasermaze', 'keystrike', 'pulseparry',
    'bubbleshooter', 'caverncrush', 'wobble-drop', 'canyonglider',
  ]),
  word: new Set(['hangman', 'wordweave', 'letterlock', 'wordsearch', 'wordladder', 'minicrossword']),
  cards: new Set([
    'setmatch', 'crazyeights', 'twentyone', 'tripeaks', 'solitaire', 'freecell',
    'mahjongsolitaire', 'dominodraw',
  ]),
  sports: new Set([
    'airhockey', 'skeeball', 'pool', 'plinko', 'darts', 'minigolf', 'ski',
    'homerunderby', 'nebulacurl',
  ]),
  racing: new Set([
    'dino', 'micro-rc-racer', 'neonrally', 'skywire', 'gravityswitch',
    'trailblazer', 'aerocourier', 'sundialsprint', 'canyonglider',
  ]),
  strategy: new Set([
    'prisonersdilemma', 'connect4', 'towerdefense', 'waterballoon', 'battleship',
    'dotsandboxes', 'reversi', 'checkers', 'nimgrove', 'mancala', 'backgammon',
    'chess', 'gomokugrid', 'oregontrail', 'pokemon',
  ]),
  'audio-accessible': new Set(['audioagar', 'echolabyrinth', 'beatrail', 'branchingaudio']),
  'two-player': new Set([
    'pong', 'airhockey', 'tictactoe', 'rps', 'connect4', 'waterballoon',
    'battleship', 'dotsandboxes', 'reversi', 'checkers', 'mancala',
    'backgammon', 'chess', 'gomokugrid',
  ]),
});

const TRENDING_SLUGS = Object.freeze([
  'tetris', 'pacman', 'snake', '2048', 'bubbleshooter', 'chess', 'plinko',
  'towerdefense', 'wordsearch', 'dino', 'skeeball', 'audioagar',
]);

const TOP_PLAYED_SLUGS = Object.freeze([
  '2048', 'snake', 'tetris', 'pacman', 'pong', 'chess', 'minesweeper',
  'connect4', 'solitaire', 'checkers', 'flappy', 'breakout',
]);

const LONG_SLUGS = Object.freeze(new Set([
  'clubpenguin-world', 'prisonersdilemma', 'oregontrail', 'pokemon',
  'towerdefense', 'chess', 'backgammon', 'mahjongsolitaire',
]));

const HARD_SLUGS = Object.freeze(new Set([
  'prisonersdilemma', 'oregontrail', 'towerdefense', 'chess', 'gomokugrid',
  'sudokusprint', 'kakuro', 'calccages', 'nonogram', 'bridgeislands',
]));

const EASY_SLUGS = Object.freeze(new Set([
  'pong', 'rps', 'snake', 'tictactoe', 'memory', 'flappy', 'dino',
  'whackamole', 'colorcatch', 'plinko', 'skeeball',
]));

const MULTIPLAYER_SLUGS = Object.freeze(new Set(['clubpenguin-world', 'audioagar']));
const TWO_PLAYER_SLUGS = Object.freeze(DISCOVERY_CATEGORY_GROUPS['two-player']);
const BASE_RELEASE_TIME = Date.UTC(2026, 1, 10);
const DAY_MS = 24 * 60 * 60 * 1000;

const rankMap = (slugs) => Object.freeze(
  slugs.reduce((acc, slug, index) => {
    acc[slug] = index + 1;
    return acc;
  }, {}),
);

const TRENDING_RANKS = rankMap(TRENDING_SLUGS);
const TOP_PLAYED_RANKS = rankMap(TOP_PLAYED_SLUGS);

const FEATURED_ART = Object.freeze({
  '2048': { poster: '/assets/og/2048.png', thumb: '/assets/og/2048.png' },
  audioagar: { poster: '/assets/og/audioagar.png', thumb: '/assets/og/audioagar.png' },
  bubbleshooter: { poster: '/assets/og/bubbleshooter.png', thumb: '/assets/og/bubbleshooter.png' },
  chess: { poster: '/assets/og/chess.png', thumb: '/assets/og/chess.png' },
  dino: { poster: '/assets/og/dino.png', thumb: '/assets/og/dino.png' },
  pacman: { poster: '/assets/discovery/pacman-poster.webp', thumb: '/assets/discovery/pacman-poster.webp' },
  plinko: { poster: '/assets/og/plinko.png', thumb: '/assets/og/plinko.png' },
  pong: { poster: '/assets/og/pong.png', thumb: '/assets/og/pong.png' },
  skeeball: { poster: '/assets/og/skeeball.png', thumb: '/assets/og/skeeball.png' },
  snake: { poster: '/assets/discovery/snake-poster.webp', thumb: '/assets/discovery/snake-poster.webp' },
  tetris: { poster: '/assets/discovery/tetris-poster.webp', thumb: '/assets/discovery/tetris-poster.webp' },
  towerdefense: { poster: '/assets/og/towerdefense.png', thumb: '/assets/og/towerdefense.png' },
  wordsearch: { poster: '/assets/og/wordsearch.png', thumb: '/assets/og/wordsearch.png' },
});

const releaseDateForIndex = (index) => (
  new Date(BASE_RELEASE_TIME + index * DAY_MS).toISOString().slice(0, 10)
);

const inferCategories = (game) => {
  const categories = new Set();
  for (const [key, slugs] of Object.entries(DISCOVERY_CATEGORY_GROUPS)) {
    if (slugs.has(game.slug)) categories.add(key);
  }

  const haystack = `${game.slug} ${game.name} ${game.desc || ''} ${game.scoreHint || ''}`.toLowerCase();
  if (game.category === 'audio-only-blind-accessible') categories.add('audio-accessible');
  if (/(word|letter|hangman)/.test(haystack)) categories.add('word');
  if (/(card|solitaire|domino|mahjong)/.test(haystack)) categories.add('cards');
  if (/(race|racing|lap|run|runner|sprint|dash)/.test(haystack)) categories.add('racing');
  if (/(puzzle|solve|logic|maze|grid|tile|path|sort|match)/.test(haystack)) categories.add('puzzle');
  if (/(score|waves|arcade|dodge|blast|jump|runner|pinball)/.test(haystack)) categories.add('arcade');
  if (/(ai|strategy|tactical|battle|defense|opponent)/.test(haystack)) categories.add('strategy');

  if (!categories.size) categories.add(game.earnsCoins === false ? 'strategy' : 'arcade');
  return new Set([...categories].filter((category) => DISCOVERY_CATEGORY_KEYS.has(category)));
};

const inferModes = (game) => {
  const modes = new Set(['solo']);
  if (TWO_PLAYER_SLUGS.has(game.slug)) modes.add('two-player');
  if (MULTIPLAYER_SLUGS.has(game.slug)) modes.add('multiplayer');
  return [...modes];
};

const inferDuration = (game, categories) => {
  if (LONG_SLUGS.has(game.slug)) return 'long';
  if (EASY_SLUGS.has(game.slug) || categories.has('arcade') || categories.has('sports')) return 'quick';
  return 'medium';
};

const inferDifficulty = (game, categories) => {
  if (HARD_SLUGS.has(game.slug)) return 'hard';
  if (EASY_SLUGS.has(game.slug)) return 'easy';
  if (categories.has('strategy') || categories.has('puzzle')) return 'medium';
  return 'easy';
};

export const GAMES = BASE_GAMES.map((game, index) => {
  const categoriesSet = inferCategories(game);
  const modes = inferModes(game);
  const duration = inferDuration(game, categoriesSet);
  const difficulty = inferDifficulty(game, categoriesSet);
  const featured = {
    dailyEligible: true,
    weeklyEligible: duration !== 'long' || categoriesSet.has('strategy'),
  };
  if (TRENDING_RANKS[game.slug]) featured.trendingRank = TRENDING_RANKS[game.slug];
  if (TOP_PLAYED_RANKS[game.slug]) featured.topPlayedRank = TOP_PLAYED_RANKS[game.slug];

  return {
    ...game,
    categories: [...categoriesSet],
    modes,
    duration,
    difficulty,
    releasedAt: releaseDateForIndex(index),
    featured,
    ...(FEATURED_ART[game.slug] ? { art: FEATURED_ART[game.slug] } : {}),
  };
});
