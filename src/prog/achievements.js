import { state, save } from '../core/state.js';
import { recordMissionProgress } from './missions.js';

const DEFAULT_RESULTS_SET = new Set(['win', 'won']);

const hasResult = (ctx, key, results = null) => {
  const value = ctx?.[key]?.result;
  if (!results) return DEFAULT_RESULTS_SET.has(value);
  return results.includes(value);
};

const scoreAtLeast = (ctx, key, score) => (ctx?.[key]?.score ?? 0) >= score;

const badgeDefs = [
  { id:'first-run', name:'First Steps', icon:'\u{1F463}', desc:'Play any game once', test: (ctx) => ctx.anyPlay },
  { id:'pong-pro', name:'Pong Pro', icon:'\u{1F3D3}', desc:'Win a Pong match by 3+ points', test: (ctx) => ctx.pong && ctx.pong.winMargin >= 3 },
  { id:'pong-king', name:'King of Pong', icon:'\u{1F451}', desc:'Win a Pong match by 5+ points', test: (ctx) => ctx.pong && ctx.pong.winMargin >= 5 },
  { id:'pong-perfect-7', name:'Table Titan', icon:'\u{1F3D3}', desc:'Win a Pong match by 7+ points', test: (ctx) => ctx.pong && ctx.pong.winMargin >= 7 },
  { id:'snake-15', name:'Danger Snack', icon:'\u{1F40D}', desc:'Reach length 15 in Snake', test: (ctx) => ctx.snake && ctx.snake.length >= 15 },
  { id:'snake-25', name:'World Eater', icon:'\u{1F409}', desc:'Reach length 25 in Snake', test: (ctx) => ctx.snake && ctx.snake.length >= 25 },
  { id:'snake-30', name:'Garden Legend', icon:'\u{1F33F}', desc:'Reach length 30 in Snake', test: (ctx) => ctx.snake && ctx.snake.length >= 30 },
  { id:'dino-300', name:'Speedster', icon:'\u26A1', desc:'Reach 300+ distance in Dino Run', test: (ctx) => ctx.dino && ctx.dino.dist >= 300 },
  { id:'dino-1000', name:'Meteor Strider', icon:'\u2604\uFE0F', desc:'Reach 1000+ distance in Dino Run', test: (ctx) => ctx.dino && ctx.dino.dist >= 1000 },
  { id:'dino-1500', name:'Extinction Dodger', icon:'\u{1F996}', desc:'Reach 1500+ distance in Dino Run', test: (ctx) => ctx.dino && ctx.dino.dist >= 1500 },
  { id:'frogger-10', name:'River Runner', icon:'\u{1F438}', desc:'Score 10+ points in Frogger', test: (ctx) => ctx.frogger && ctx.frogger.score >= 10 },
  { id:'frogger-15', name:'Highway Hopper', icon:'\u{1F6A6}', desc:'Score 15+ points in Frogger', test: (ctx) => ctx.frogger && ctx.frogger.score >= 15 },
  { id:'ttt-triple', name:'Big Brain', icon:'\u{1F9E0}', desc:'Win 3 Tic-Tac-Toe games total', test: (ctx) => (ctx.tttWinsTotal ?? 0) >= 3 },
  { id:'tetris-20-lines', name:'Stack Attack', icon:'\u{1F9F1}', desc:'Clear 20 lines in Tetris', test: (ctx) => ctx.tetris && ctx.tetris.lines >= 20 },
  { id:'tetris-45-lines', name:'Line Architect', icon:'\u{1F3D7}\uFE0F', desc:'Clear 45 lines in Tetris', test: (ctx) => ctx.tetris && ctx.tetris.lines >= 45 },
  { id:'tetris-3000', name:'Tetris Titan', icon:'\u{1F3C6}', desc:'Reach 3000+ score in Tetris', test: (ctx) => ctx.tetris && ctx.tetris.score >= 3000 },
  { id:'tetris-6000', name:'Block Baron', icon:'\u{1F48E}', desc:'Reach 6000+ score in Tetris', test: (ctx) => ctx.tetris && ctx.tetris.score >= 6000 },
  { id:'asteroids-wave-5', name:'Rock Hunter', icon:'\u2604\uFE0F', desc:'Reach wave 5 in Asteroids', test: (ctx) => ctx.asteroids && ctx.asteroids.wave >= 5 },
  { id:'asteroids-wave-8', name:'Belt Breaker', icon:'\u{1FA90}', desc:'Reach wave 8 in Asteroids', test: (ctx) => ctx.asteroids && ctx.asteroids.wave >= 8 },
  { id:'asteroids-3000', name:'Deep Space Ace', icon:'\u{1F680}', desc:'Score 3000+ in Asteroids', test: (ctx) => ctx.asteroids && ctx.asteroids.score >= 3000 },
  { id:'asteroids-6000', name:'Nebula Navigator', icon:'\u{1F30C}', desc:'Score 6000+ in Asteroids', test: (ctx) => ctx.asteroids && ctx.asteroids.score >= 6000 },
  { id:'bomberman-level-4', name:'Fuse Master', icon:'\u{1F4A3}', desc:'Reach level 4 in Bomberman Lite', test: (ctx) => ctx.bomberman && ctx.bomberman.level >= 4 },
  { id:'bomberman-crates-40', name:'Demolition Expert', icon:'\u{1F4A5}', desc:'Destroy 40 crates in one Bomberman run', test: (ctx) => ctx.bomberman && ctx.bomberman.crates >= 40 },
  { id:'colorcatch-stage-3', name:'Spectrum Climber', icon:'\u{1F308}', desc:'Reach stage 3 in Color Catch Arcade', test: (ctx) => ctx.colorcatch && ctx.colorcatch.stage >= 3 },
  { id:'colorcatch-2200', name:'Prism Pro', icon:'\u{2728}', desc:'Score 2200+ in Color Catch Arcade', test: (ctx) => ctx.colorcatch && ctx.colorcatch.score >= 2200 },
  { id:'colorcatch-4000', name:'Rainbow Reactor', icon:'\u{1F308}', desc:'Score 4000+ in Color Catch Arcade', test: (ctx) => ctx.colorcatch && ctx.colorcatch.score >= 4000 },
  { id:'pokemon-first-badge', name:'Circuit Badge', icon:'\u{1F3F5}\uFE0F', desc:'Earn 1 badge in Pokemon', test: (ctx) => ctx.pokemon && ctx.pokemon.badges >= 1 },
  { id:'pokemon-capture-3', name:'Collector Cadet', icon:'\u{1F9E2}', desc:'Capture 3 Pokemon', test: (ctx) => ctx.pokemon && ctx.pokemon.captures >= 3 },
  { id:'pokemon-badge-pair', name:'Gym Circuit', icon:'\u{1F396}\uFE0F', desc:'Earn 2 badges in Pokemon', test: (ctx) => ctx.pokemon && ctx.pokemon.badges >= 2 },
  { id:'whackamole-1500', name:'Mole Mauler', icon:'\u{1F528}', desc:'Score 1500+ in Whack-a-Mole', test: (ctx) => scoreAtLeast(ctx, 'whackamole', 1500) },
  { id:'whackamole-streak-12', name:'Reflex Rally', icon:'\u{1F947}', desc:'Hit a 12+ streak in Whack-a-Mole', test: (ctx) => ctx.whackamole && ctx.whackamole.streak >= 12 },
  { id:'boxquest-level-3', name:'Crate Captain', icon:'\u{1F4E6}', desc:'Clear level 3 in Box Quest', test: (ctx) => ctx.boxquest && ctx.boxquest.level >= 3 },
  { id:'boxquest-level-6', name:'Warehouse Wizard', icon:'\u{1F9D9}', desc:'Clear level 6 in Box Quest', test: (ctx) => ctx.boxquest && ctx.boxquest.level >= 6 },
  { id:'hangman-win', name:'Word Rescuer', icon:'\u{1F524}', desc:'Win a Hangman round', test: (ctx) => ctx.hangman && ctx.hangman.wins >= 1 },
  { id:'hangman-streak-3', name:'Noose Ninja', icon:'\u{1F575}\uFE0F', desc:'Build a 3-win Hangman streak', test: (ctx) => ctx.hangman && ctx.hangman.bestStreak >= 3 },
  { id:'mancala-win', name:'Seed Strategist', icon:'\u{1F331}', desc:'Win a Mancala match', test: (ctx) => ctx.mancala && ctx.mancala.margin > 0 },
  { id:'mancala-margin-10', name:'Granary Grandmaster', icon:'\u{1F3FA}', desc:'Win Mancala by 10+ stones', test: (ctx) => ctx.mancala && ctx.mancala.margin >= 10 },
  { id:'pegsolitaire-solved', name:'Peg Planner', icon:'\u{1F9E9}', desc:'Solve a Peg Solitaire board', test: (ctx) => ctx.pegsolitaire?.result === 'solved' },
  { id:'pegsolitaire-center', name:'Center Finisher', icon:'\u{1F3AF}', desc:'Finish Peg Solitaire in the center', test: (ctx) => ctx.pegsolitaire?.center_finish === true },
  { id:'towerhanoi-solved', name:'Tower Tactician', icon:'\u{1F5FC}', desc:'Solve Tower of Hanoi', test: (ctx) => ctx.towerhanoi?.result === 'solved' || hasResult(ctx, 'towerhanoi') },
  { id:'lightsout-solved', name:'Lights Out', icon:'\u{1F4A1}', desc:'Solve a Lights Out puzzle', test: (ctx) => ctx.lightsout && (ctx.lightsout.solved >= 1 || hasResult(ctx, 'lightsout')) },
  { id:'doodlejump-500', name:'Sky Bouncer', icon:'\u{1FA82}', desc:'Reach 500 height in Doodle Jump', test: (ctx) => ctx.doodlejump && ctx.doodlejump.height >= 500 },
  { id:'doodlejump-1000', name:'Cloud Surfer', icon:'\u2601\uFE0F', desc:'Reach 1000 height in Doodle Jump', test: (ctx) => ctx.doodlejump && ctx.doodlejump.height >= 1000 },
  { id:'neonrally-win', name:'Neon Champion', icon:'\u{1F3CE}\uFE0F', desc:'Win a Neon Rally race', test: (ctx) => ctx.neonrally?.won === true || (ctx.neonrally?.place ?? 99) === 1 },
  { id:'neonrally-podium', name:'Podium Pilot', icon:'\u{1F3C1}', desc:'Finish on the podium in Neon Rally', test: (ctx) => ctx.neonrally && ctx.neonrally.place <= 3 && ctx.neonrally.laps > 0 },
  { id:'pinball-10000', name:'Silverball Star', icon:'\u{1F3B1}', desc:'Score 10000+ in Pinball', test: (ctx) => scoreAtLeast(ctx, 'pinball', 10000) },
  { id:'pinball-25000', name:'Wizard Mode', icon:'\u{1F52E}', desc:'Score 25000+ in Pinball', test: (ctx) => scoreAtLeast(ctx, 'pinball', 25000) },
  { id:'battleship-win', name:'Fleet Commander', icon:'\u{1F6A2}', desc:'Win a Battleship match', test: (ctx) => hasResult(ctx, 'battleship') || ctx.battleship?.won === true },
  { id:'gomoku-win', name:'Five-in-a-Row', icon:'\u26AB', desc:'Win a Gomoku Grid match', test: (ctx) => scoreAtLeast(ctx, 'gomoku', 1) || hasResult(ctx, 'gomoku') },
  { id:'waterballoon-win', name:'Splash Strategist', icon:'\u{1F4A6}', desc:'Win a Water Balloon Coding duel', test: (ctx) => ctx.waterballoon?.winner === true },
  { id:'waterballoon-fast', name:'Quick Soaker', icon:'\u{1F6BF}', desc:'Win Water Balloon in 3 turns or fewer', test: (ctx) => ctx.waterballoon?.winner === true && ctx.waterballoon.turns <= 3 },
  { id:'ribboncapture-50', name:'Ribbon Scout', icon:'\u{1F380}', desc:'Claim 50% of the field in Ribbon Capture', test: (ctx) => ctx.ribboncapture && ctx.ribboncapture.claimed >= 50 },
  { id:'ribboncapture-75', name:'Territory Artist', icon:'\u{1F5FA}\uFE0F', desc:'Claim 75% of the field in Ribbon Capture', test: (ctx) => ctx.ribboncapture && ctx.ribboncapture.claimed >= 75 },
  { id:'mosaicmatch-2000', name:'Mosaic Maven', icon:'\u{1F5BC}\uFE0F', desc:'Score 2000+ in Mosaic Match', test: (ctx) => scoreAtLeast(ctx, 'mosaicmatch', 2000) },
  { id:'mosaicmatch-perfect-3', name:'Perfect Pattern', icon:'\u{1F9FF}', desc:'Complete 3 perfect Mosaic Match levels', test: (ctx) => ctx.mosaicmatch && ctx.mosaicmatch.perfectLevels >= 3 },
  { id:'sudokusprint-win', name:'Sudoku Sprinter', icon:'\u{1F522}', desc:'Finish a Sudoku Sprint puzzle', test: (ctx) => hasResult(ctx, 'sudokusprint') || ctx.sudokusprint?.result === 'complete' },
  { id:'sudokusprint-1200', name:'Number Ninja', icon:'\u{1F9EE}', desc:'Score 1200+ in Sudoku Sprint', test: (ctx) => scoreAtLeast(ctx, 'sudokusprint', 1200) },
  { id:'wordweave-solved', name:'Word Weaver', icon:'\u{1F9F6}', desc:'Solve a Word Weave board', test: (ctx) => ctx.wordweave && (ctx.wordweave.solved >= 1 || hasResult(ctx, 'wordweave')) },
  { id:'wordweave-2500', name:'Lexicon Legend', icon:'\u{1F4DA}', desc:'Score 2500+ in Word Weave', test: (ctx) => scoreAtLeast(ctx, 'wordweave', 2500) },
  { id:'letterlock-solved', name:'Lock Picker', icon:'\u{1F510}', desc:'Solve a Letter Lock puzzle', test: (ctx) => scoreAtLeast(ctx, 'letterlock', 1) },
  { id:'letterlock-fast', name:'Three Guess Key', icon:'\u{1F5DD}\uFE0F', desc:'Solve Letter Lock in 3 guesses or fewer', test: (ctx) => ctx.letterlock && ctx.letterlock.score > 0 && ctx.letterlock.guesses <= 3 },
  { id:'letterlock-no-hint', name:'Clean Cipher', icon:'\u{1F9E0}', desc:'Solve Letter Lock without using a hint', test: (ctx) => ctx.letterlock && ctx.letterlock.score > 0 && ctx.letterlock.hintUsed === false },
  { id:'letterlock-streak-3', name:'Word Vault Streak', icon:'\u{1F512}', desc:'Build a 3-puzzle Letter Lock streak', test: (ctx) => ctx.letterlock && ctx.letterlock.streak >= 3 },
  { id:'tangletuner-complete', name:'Tangle Tuner', icon:'\u{1F9F5}', desc:'Solve every Tangle Tuner level', test: (ctx) => ctx.tangletuner && ctx.tangletuner.solved >= 1 },
  { id:'diceforge-win', name:'Dice Smith', icon:'\u{1F3B2}', desc:'Clear Dice Forge', test: (ctx) => ctx.diceforge?.result === 'win' },
  { id:'diceforge-1200', name:'Loaded Luck', icon:'\u{1F340}', desc:'Score 1200+ in Dice Forge', test: (ctx) => scoreAtLeast(ctx, 'diceforge', 1200) },
  { id:'bubbleshooter-clear', name:'Bubble Clear', icon:'\u{1FAE7}', desc:'Clear a Bubble Shooter board', test: (ctx) => hasResult(ctx, 'bubbleshooter') },
  { id:'bubbleshooter-pop-80', name:'Bubble Breaker', icon:'\u{1F9FC}', desc:'Pop 80+ bubbles in Bubble Shooter', test: (ctx) => ctx.bubbleshooter && ctx.bubbleshooter.popped >= 80 },
  { id:'bubbleshooter-2500', name:'Arc Popper', icon:'\u{1F4AB}', desc:'Score 2500+ in Bubble Shooter', test: (ctx) => scoreAtLeast(ctx, 'bubbleshooter', 2500) },
  { id:'codebreaker-cracked', name:'Code Cracker', icon:'\u{1F9E9}', desc:'Crack a Codebreaker Grid puzzle', test: (ctx) => hasResult(ctx, 'codebreaker') },
  { id:'codebreaker-quick', name:'Four-Try Cipher', icon:'\u{1F50D}', desc:'Crack Codebreaker Grid in 4 attempts or fewer', test: (ctx) => hasResult(ctx, 'codebreaker') && ctx.codebreaker.attempts <= 4 },
  { id:'codebreaker-900', name:'Logic Lockmaster', icon:'\u{1F9EE}', desc:'Score 900+ in Codebreaker Grid', test: (ctx) => scoreAtLeast(ctx, 'codebreaker', 900) },
  { id:'gemswap-win', name:'Gem Swapper', icon:'\u{1F48E}', desc:'Win a Gem Swap Blitz round', test: (ctx) => ctx.gemswap?.won === true },
  { id:'gemswap-combo-4', name:'Cascade Crafter', icon:'\u{1F4A0}', desc:'Build a 4+ combo in Gem Swap Blitz', test: (ctx) => ctx.gemswap && ctx.gemswap.bestCombo >= 4 },
  { id:'gemswap-2500', name:'Jewel Storm', icon:'\u{1F31F}', desc:'Score 2500+ in Gem Swap Blitz', test: (ctx) => scoreAtLeast(ctx, 'gemswap', 2500) },
  { id:'beatforge-win', name:'Beat Forger', icon:'\u{1F3B5}', desc:'Win a Beat Forge run', test: (ctx) => hasResult(ctx, 'beatforge') },
  { id:'beatforge-streak-12', name:'Rhythm Smith', icon:'\u{1F941}', desc:'Hit a 12+ streak in Beat Forge', test: (ctx) => ctx.beatforge && ctx.beatforge.bestStreak >= 12 },
  { id:'beatforge-1800', name:'Tempo Titan', icon:'\u{1F3BC}', desc:'Score 1800+ in Beat Forge', test: (ctx) => scoreAtLeast(ctx, 'beatforge', 1800) },
  { id:'cloudclimber-win', name:'Cloud Climber', icon:'\u{1F9D7}', desc:'Complete a Cloud Climber run', test: (ctx) => hasResult(ctx, 'cloudclimber') },
  { id:'cloudclimber-8-lanterns', name:'Lantern Lifter', icon:'\u{1F3EE}', desc:'Collect 8+ lanterns in Cloud Climber', test: (ctx) => ctx.cloudclimber && ctx.cloudclimber.lanterns >= 8 },
  { id:'skywire-600', name:'Wire Walker', icon:'\u{1F6A1}', desc:'Travel 600+ distance in Skywire Sprint', test: (ctx) => ctx.skywire && ctx.skywire.distance >= 600 },
  { id:'skywire-1200', name:'Cable Ace', icon:'\u26A1', desc:'Score 1200+ in Skywire Sprint', test: (ctx) => scoreAtLeast(ctx, 'skywire', 1200) },
  { id:'starfielddodger-minute', name:'Starfield Survivor', icon:'\u{1F320}', desc:'Survive 60+ seconds in Starfield Dodger', test: (ctx) => ctx.starfielddodger && ctx.starfielddodger.time >= 60 },
  { id:'starfielddodger-12-stars', name:'Stellar Collector', icon:'\u2B50', desc:'Collect 12+ stars in Starfield Dodger', test: (ctx) => ctx.starfielddodger && ctx.starfielddodger.stars >= 12 },
  { id:'reactiongrid-blocks-30', name:'Reflex Shield', icon:'\u{1F6E1}\uFE0F', desc:'Block 30+ shots in Reaction Grid', test: (ctx) => ctx.reactiongrid && ctx.reactiongrid.blocks >= 30 },
  { id:'reactiongrid-clean', name:'Leak Stopper', icon:'\u{1F6AB}', desc:'Finish Reaction Grid with 3 or fewer leaks', test: (ctx) => hasResult(ctx, 'reactiongrid') && ctx.reactiongrid.leaks <= 3 },
  { id:'gravityswitch-700', name:'Gravity Glider', icon:'\u{1F300}', desc:'Travel 700+ distance in Gravity Switch', test: (ctx) => ctx.gravityswitch && ctx.gravityswitch.distance >= 700 },
  { id:'gravityswitch-10-stars', name:'Orbit Runner', icon:'\u{1FA90}', desc:'Collect 10+ stars in Gravity Switch', test: (ctx) => ctx.gravityswitch && ctx.gravityswitch.stars >= 10 },
  { id:'chromeshift-40', name:'Chrome Cartographer', icon:'\u{1F5FA}\uFE0F', desc:'Claim 40+ territory in Chrome Shift', test: (ctx) => ctx.chromeshift && ctx.chromeshift.territory >= 40 },
  { id:'chromeshift-spare-5', name:'Move Saver', icon:'\u{1F4CD}', desc:'Win Chrome Shift with 5+ moves left', test: (ctx) => hasResult(ctx, 'chromeshift') && ctx.chromeshift.movesLeft >= 5 },
  { id:'trailblazer-45', name:'Trail Painter', icon:'\u{1F58C}\uFE0F', desc:'Paint 45+ tiles in Trailblazer Grid', test: (ctx) => ctx.trailblazer && ctx.trailblazer.painted >= 45 },
  { id:'trailblazer-win', name:'Grid Blazer', icon:'\u{1F525}', desc:'Win a Trailblazer Grid run', test: (ctx) => hasResult(ctx, 'trailblazer') },
  { id:'vaultrunner-stage-3', name:'Vault Runner', icon:'\u{1F3C3}', desc:'Reach stage 3 in Vault Runner', test: (ctx) => ctx.vaultrunner && ctx.vaultrunner.stage >= 3 },
  { id:'vaultrunner-low-alarm', name:'Quiet Cracker', icon:'\u{1F515}', desc:'Finish Vault Runner with alarm at 20 or lower', test: (ctx) => hasResult(ctx, 'vaultrunner') && ctx.vaultrunner.alarm <= 20 },
  { id:'portpilot-win', name:'Harbor Hero', icon:'\u2693', desc:'Win a Port Pilot route', test: (ctx) => hasResult(ctx, 'portpilot') },
  { id:'portpilot-5-delivered', name:'Dockmaster', icon:'\u{1F6DF}', desc:'Deliver 5+ pods in Port Pilot', test: (ctx) => ctx.portpilot && ctx.portpilot.delivered >= 5 },
  { id:'aerocourier-5-deliveries', name:'Aero Courier', icon:'\u{1F6E9}\uFE0F', desc:'Complete 5+ deliveries in Aero Courier', test: (ctx) => ctx.aerocourier && ctx.aerocourier.deliveries >= 5 },
  { id:'aerocourier-1500', name:'Jetstream Ace', icon:'\u2708\uFE0F', desc:'Score 1500+ in Aero Courier', test: (ctx) => scoreAtLeast(ctx, 'aerocourier', 1500) },
  { id:'cometcourier-8-served', name:'Comet Courier', icon:'\u2604\uFE0F', desc:'Serve 8+ customers in Comet Courier', test: (ctx) => ctx.cometcourier && ctx.cometcourier.served >= 8 },
  { id:'cometcourier-2000', name:'Orbit Express', icon:'\u{1F6F0}\uFE0F', desc:'Score 2000+ in Comet Courier', test: (ctx) => scoreAtLeast(ctx, 'cometcourier', 2000) },
  { id:'cranecargo-5-delivered', name:'Crane Captain', icon:'\u{1F3D7}\uFE0F', desc:'Deliver 5+ cargo crates in Crane Cargo', test: (ctx) => ctx.cranecargo && ctx.cranecargo.delivered >= 5 },
  { id:'cranecargo-1500', name:'Cargo Champion', icon:'\u{1F69A}', desc:'Score 1500+ in Crane Cargo', test: (ctx) => scoreAtLeast(ctx, 'cranecargo', 1500) },
  { id:'switchyard-5-delivered', name:'Switchyard Shipper', icon:'\u{1F682}', desc:'Deliver 5+ cars in Switchyard', test: (ctx) => ctx.switchyard && ctx.switchyard.delivered >= 5 },
  { id:'canallock-5-delivered', name:'Canal Keeper', icon:'\u{1F6A4}', desc:'Deliver 5+ boats in Canal Lock', test: (ctx) => ctx.canallock && ctx.canallock.delivered >= 5 },
  { id:'prismpipeline-match-8', name:'Prism Plumber', icon:'\u{1F52E}', desc:'Match 8+ channels in Prism Pipeline', test: (ctx) => ctx.prismpipeline && ctx.prismpipeline.matched >= 8 },
  { id:'circuitpath-10-nodes', name:'Circuit Solver', icon:'\u{1F50C}', desc:'Connect 10+ nodes in Circuit Path', test: (ctx) => ctx.circuitpath && ctx.circuitpath.nodes >= 10 },
  { id:'signalstack-8-connected', name:'Signal Stacker', icon:'\u{1F4F6}', desc:'Connect 8+ signals in Signal Stack', test: (ctx) => ctx.signalstack && ctx.signalstack.connected >= 8 },
  { id:'lasermaze-win', name:'Laser Cartographer', icon:'\u{1F4A0}', desc:'Win Laser Maze', test: (ctx) => hasResult(ctx, 'lasermaze') },
  { id:'lasermaze-2000', name:'Beam Bender', icon:'\u{1F536}', desc:'Score 2000+ in Laser Maze', test: (ctx) => scoreAtLeast(ctx, 'lasermaze', 2000) },
  { id:'hexharvest-10', name:'Hex Harvester', icon:'\u{1F33E}', desc:'Harvest 10+ tiles in Hex Harvest', test: (ctx) => ctx.hexharvest && ctx.hexharvest.harvested >= 10 },
  { id:'orbitorchard-12-fruit', name:'Orbit Orchardist', icon:'\u{1F34E}', desc:'Collect 12+ fruit in Orbit Orchard', test: (ctx) => ctx.orbitorchard && ctx.orbitorchard.fruit >= 12 },
  { id:'emberwatch-6-rescued', name:'Ember Guardian', icon:'\u{1F692}', desc:'Rescue 6+ campers in Ember Watch', test: (ctx) => ctx.emberwatch && ctx.emberwatch.rescued >= 6 },
  { id:'emberwatch-10-fires', name:'Fireline Finisher', icon:'\u{1F525}', desc:'Put out 10+ fires in Ember Watch', test: (ctx) => ctx.emberwatch && ctx.emberwatch.firesOut >= 10 },
  { id:'glacierguard-win', name:'Glacier Guardian', icon:'\u{1F9CA}', desc:'Win a Glacier Guard run', test: (ctx) => hasResult(ctx, 'glacierguard') },
  { id:'glacierguard-low-melt', name:'Frost Saver', icon:'\u2744\uFE0F', desc:'Finish Glacier Guard with 3 or fewer melts', test: (ctx) => hasResult(ctx, 'glacierguard') && ctx.glacierguard.melted <= 3 },
  { id:'tidetower-win', name:'Tide Tamer', icon:'\u{1F30A}', desc:'Endure the Tide Tower storm', test: (ctx) => ctx.tidetower?.result === 'win' },
  { id:'tidetower-80-integrity', name:'Storm Sentinel', icon:'\u{1F6E1}\uFE0F', desc:'Finish Tide Tower with 80+ integrity', test: (ctx) => ctx.tidetower?.result === 'win' && ctx.tidetower.integrity >= 80 },
  { id:'reactorrelay-win', name:'Reactor Relay', icon:'\u{1F4A1}', desc:'Survive a Reactor Relay storm', test: (ctx) => hasResult(ctx, 'reactorrelay') },
  { id:'reactorrelay-6-stabilized', name:'Core Stabilizer', icon:'\u269B\uFE0F', desc:'Stabilize 6+ nodes in Reactor Relay', test: (ctx) => ctx.reactorrelay && ctx.reactorrelay.stabilized >= 6 },
  { id:'starlattice-win', name:'Star Lattice Pilot', icon:'\u2728', desc:'Win a Star Lattice run', test: (ctx) => hasResult(ctx, 'starlattice') },
  { id:'starlattice-6-delivered', name:'Lattice Loader', icon:'\u{1F4E1}', desc:'Deliver 6+ payloads in Star Lattice', test: (ctx) => ctx.starlattice && ctx.starlattice.delivered >= 6 },
  { id:'starlattice-shield-3', name:'Shield Saver', icon:'\u{1F6E1}\uFE0F', desc:'Finish Star Lattice with 3+ shield left', test: (ctx) => hasResult(ctx, 'starlattice') && ctx.starlattice.shield >= 3 },
  { id:'cindercrash-win', name:'Cinder Survivor', icon:'\u{1F30B}', desc:'Win a Cinder Crash route', test: (ctx) => hasResult(ctx, 'cindercrash') },
  { id:'cindercrash-8-cores', name:'Core Collector', icon:'\u{1F48E}', desc:'Collect 8+ cores in Cinder Crash', test: (ctx) => ctx.cindercrash && ctx.cindercrash.cores >= 8 },
  { id:'driftdredger-win', name:'Drift Dredger', icon:'\u{1F6A2}', desc:'Win a Drift Dredger run', test: (ctx) => hasResult(ctx, 'driftdredger') },
  { id:'driftdredger-10-salvage', name:'Salvage Savant', icon:'\u2699\uFE0F', desc:'Recover 10+ salvage in Drift Dredger', test: (ctx) => ctx.driftdredger && ctx.driftdredger.salvage >= 10 },
  { id:'riftdrifter-10-shards', name:'Rift Drifter', icon:'\u{1F300}', desc:'Collect 10+ shards in Rift Drifter', test: (ctx) => ctx.riftdrifter && ctx.riftdrifter.shards >= 10 },
  { id:'solarskiff-10-shards', name:'Solar Skiff', icon:'\u2600\uFE0F', desc:'Collect 10+ shards in Solar Skiff', test: (ctx) => ctx.solarskiff && ctx.solarskiff.shards >= 10 },
  { id:'orbitalrescue-win', name:'Orbital Rescuer', icon:'\u{1F6F8}', desc:'Complete an Orbital Rescue run', test: (ctx) => hasResult(ctx, 'orbitalrescue') },
  { id:'treasuremaze-level-3', name:'Treasure Trailblazer', icon:'\u{1F5DD}\uFE0F', desc:'Reach level 3 in Treasure Maze', test: (ctx) => ctx.treasuremaze && ctx.treasuremaze.level >= 3 },
  { id:'treasuremaze-8-treasures', name:'Relic Runner', icon:'\u{1F3FA}', desc:'Collect 8+ treasures in Treasure Maze', test: (ctx) => ctx.treasuremaze && ctx.treasuremaze.treasures >= 8 },
  { id:'treasuremaze-1500', name:'Maze Magnate', icon:'\u{1F4B0}', desc:'Score 1500+ in Treasure Maze', test: (ctx) => scoreAtLeast(ctx, 'treasuremaze', 1500) },
  { id:'potionpantry-8-orders', name:'Potion Pantry Pro', icon:'\u2697\uFE0F', desc:'Fill 8+ orders in Potion Pantry', test: (ctx) => ctx.potionpantry && ctx.potionpantry.orders >= 8 },
  { id:'marblecircuit-win', name:'Marble Master', icon:'\u{1F3D0}', desc:'Clear a Marble Circuit run', test: (ctx) => hasResult(ctx, 'marblecircuit') },
  { id:'marblecircuit-level-3', name:'Circuit Climber', icon:'\u{1F3C1}', desc:'Reach level 3 in Marble Circuit', test: (ctx) => ctx.marblecircuit && ctx.marblecircuit.level >= 3 },
  { id:'marblecircuit-rings-9', name:'Ring Wrangler', icon:'\u{1F4CD}', desc:'Collect 9+ rings in Marble Circuit', test: (ctx) => ctx.marblecircuit && ctx.marblecircuit.rings >= 9 },
  { id:'reefrunner-win', name:'Reef Runner', icon:'\u{1FAB8}', desc:'Complete a Reef Runner dive', test: (ctx) => hasResult(ctx, 'reefrunner') },
  { id:'reefrunner-5-beacons', name:'Beacon Diver', icon:'\u{1F6DF}', desc:'Recover 5+ beacons in Reef Runner', test: (ctx) => ctx.reefrunner && ctx.reefrunner.beacons >= 5 },
  { id:'reefrunner-1200-route', name:'Current Cruiser', icon:'\u{1F30A}', desc:'Travel 1200+ route meters in Reef Runner', test: (ctx) => ctx.reefrunner && ctx.reefrunner.routeMeters >= 1200 },
  { id:'keystrike-wave-5', name:'Key Striker', icon:'\u2328\uFE0F', desc:'Reach wave 5 in Key Strike', test: (ctx) => ctx.keystrike && ctx.keystrike.wave >= 5 },
  { id:'pulseparry-wave-5', name:'Pulse Parrier', icon:'\u{1F4AB}', desc:'Reach wave 5 in Pulse Parry', test: (ctx) => ctx.pulseparry && ctx.pulseparry.wave >= 5 },
  { id:'magnetrail-5-delivered', name:'Magnet Rail Runner', icon:'\u{1F9F2}', desc:'Deliver 5+ cargo in Magnet Rail', test: (ctx) => ctx.magnetrail && ctx.magnetrail.delivered >= 5 },
  { id:'moonlander-win', name:'Moon Lander', icon:'\u{1F319}', desc:'Land successfully in Moon Lander', test: (ctx) => hasResult(ctx, 'moonlander') },
  { id:'loomlock-4-beacons', name:'Loom Locksmith', icon:'\u{1F512}', desc:'Light 4+ beacons in Loom Lock', test: (ctx) => ctx.loomlock && ctx.loomlock.beacons >= 4 },
  { id:'orbburst-2500', name:'Orb Burster', icon:'\u{1F7E3}', desc:'Score 2500+ in Orb Burst', test: (ctx) => scoreAtLeast(ctx, 'orbburst', 2500) },
  { id:'nebulacurl-2000', name:'Nebula Curler', icon:'\u{1F300}', desc:'Score 2000+ in Nebula Curl', test: (ctx) => scoreAtLeast(ctx, 'nebulacurl', 2000) },
  { id:'bytebloom-8-bloom', name:'Byte Bloom Botanist', icon:'\u{1F33A}', desc:'Grow 8+ blooms in Byte Bloom', test: (ctx) => ctx.bytebloom && ctx.bytebloom.bloom >= 8 },
  { id:'stormvault-80-charge', name:'Storm Vault Keeper', icon:'\u26C8\uFE0F', desc:'Bank 80+ charge in Storm Vault', test: (ctx) => ctx.stormvault && ctx.stormvault.charge >= 80 },
  { id:'sundialsprint-win', name:'Sundial Sprinter', icon:'\u{1F570}\uFE0F', desc:'Restore the sun path in Sundial Sprint', test: (ctx) => hasResult(ctx, 'sundialsprint') },
  { id:'sundialsprint-8-shards', name:'Sun Shard Scout', icon:'\u2600\uFE0F', desc:'Collect 8+ shards in Sundial Sprint', test: (ctx) => ctx.sundialsprint && ctx.sundialsprint.shards >= 8 },
  { id:'sundialsprint-1200', name:'Daybreak Dasher', icon:'\u{1F305}', desc:'Score 1200+ in Sundial Sprint', test: (ctx) => scoreAtLeast(ctx, 'sundialsprint', 1200) },
  { id:'daily-mission-complete', name:'Daily Starter', icon:'\u{1F4C5}', desc:'Complete any daily mission.', test: () => false },
  { id:'daily-mission-sweep', name:'Mission Sweep', icon:'\u2705', desc:'Complete all daily missions in one day.', test: () => false },
  { id:'weekly-challenge-complete', name:'Weekly Challenger', icon:'\u{1F5D3}\uFE0F', desc:'Complete any weekly challenge.', test: () => false },
  { id:'weekly-challenge-sweep', name:'Weekly Sweep', icon:'\u{1F31F}', desc:'Complete all weekly challenges in one week.', test: () => false },
  { id:'assignment-complete', name:'Assignment Ready', icon:'\u{1F393}', desc:'Complete an assigned classroom bundle.', test: () => false },
];

const rewardDefs = [
  { id: 'paddle-plasma', type: 'cosmetic', category: 'paddle', value: 'plasma', name: 'Plasma Paddle', test: (ctx) => ctx.pong && ctx.pong.winMargin >= 3 },
  { id: 'paddle-gold', type: 'cosmetic', category: 'paddle', value: 'gold', name: 'Gold Paddle', test: (ctx) => ctx.pong && ctx.pong.winMargin >= 5 },
  { id: 'paddle-void', type: 'cosmetic', category: 'paddle', value: 'void', name: 'Void Paddle', test: (ctx) => ctx.pong && ctx.pong.winMargin >= 7 },
  { id: 'snake-fire', type: 'cosmetic', category: 'snake', value: 'fire', name: 'Fire Snake', test: (ctx) => ctx.snake && ctx.snake.length >= 18 },
  { id: 'snake-cosmic', type: 'cosmetic', category: 'snake', value: 'cosmic', name: 'Cosmic Snake', test: (ctx) => ctx.snake && ctx.snake.length >= 24 },
  { id: 'snake-glacier', type: 'cosmetic', category: 'snake', value: 'glacier', name: 'Glacier Snake', test: (ctx) => ctx.snake && ctx.snake.length >= 30 },
  { id: 'dino-trail', type: 'inventory', name: 'Meteor Trail', test: (ctx) => ctx.dino && ctx.dino.dist >= 600 },
  { id: 'dino-lightning', type: 'inventory', name: 'Lightning Trail', test: (ctx) => ctx.dino && ctx.dino.dist >= 1200 },
  { id: 'mario-galaxy', type: 'cosmetic', category: 'marioShirt', value: 'galaxy', name: 'Galaxy Shirt', test: (ctx) => ctx.dino && ctx.dino.dist >= 1500 },
  { id: 'frogger-lilypad', type: 'inventory', name: 'Lily Pad Trail', test: (ctx) => ctx.frogger && ctx.frogger.score >= 8 },
  { id: 'frogger-neon-rain', type: 'inventory', name: 'Neon Rain', test: (ctx) => ctx.frogger && ctx.frogger.score >= 15 },
  { id: 'tetris-neon-grid', type: 'inventory', name: 'Neon Grid', test: (ctx) => ctx.tetris && ctx.tetris.lines >= 20 },
  { id: 'tetris-aurora-stack', type: 'inventory', name: 'Aurora Stack', test: (ctx) => ctx.tetris && ctx.tetris.lines >= 45 },
  { id: 'asteroids-plasma-laser', type: 'inventory', name: 'Plasma Laser', test: (ctx) => ctx.asteroids && ctx.asteroids.wave >= 4 },
  { id: 'asteroids-nebula-drift', type: 'inventory', name: 'Nebula Drift', test: (ctx) => ctx.asteroids && ctx.asteroids.score >= 2500 },
  { id: 'bomberman-ember-blast', type: 'inventory', name: 'Ember Blast', test: (ctx) => ctx.bomberman && ctx.bomberman.level >= 3 },
  { id: 'bomberman-jade-maze', type: 'inventory', name: 'Jade Maze', test: (ctx) => ctx.bomberman && ctx.bomberman.level >= 5 },
  { id: 'colorcatch-prism-trail', type: 'inventory', name: 'Prism Trail', test: (ctx) => ctx.colorcatch && ctx.colorcatch.score >= 1600 },
  { id: 'colorcatch-celestial-sky', type: 'inventory', name: 'Celestial Sky', test: (ctx) => ctx.colorcatch && ctx.colorcatch.stage >= 3 },
];

const addCosmeticOwnership = (reward) => {
  const list = Array.isArray(state.cosmeticsOwned?.[reward.category])
    ? state.cosmeticsOwned[reward.category]
    : [];

  if (list.length === 0) {
    state.cosmeticsOwned[reward.category] = [reward.value];
    return true;
  }

  if (list.includes(reward.value)) return false;
  state.cosmeticsOwned[reward.category] = [...list, reward.value];
  return true;
};

const addInventoryOwnership = (reward) => {
  if (state.inventory.has(reward.id)) return false;
  state.inventory.add(reward.id);
  return true;
};

export const maybeUnlock = (ctx) => {
  const missionState = recordMissionProgress(ctx);
  const unlockedBadges = [];
  const unlockedRewards = [];
  let changed = false;

  for (const d of badgeDefs) {
    if (!state.badges.has(d.id) && d.test(ctx)) {
      state.badges.add(d.id);
      unlockedBadges.push(d);
      changed = true;
    }
  }

  for (const reward of rewardDefs) {
    if (!reward.test(ctx)) continue;

    const didUnlock = reward.type === 'cosmetic'
      ? addCosmeticOwnership(reward)
      : addInventoryOwnership(reward);

    if (didUnlock) {
      unlockedRewards.push(reward);
      changed = true;
    }
  }

  if (changed) save();

  return { badges: unlockedBadges, rewards: unlockedRewards, missions: missionState };
};

export const listBadges = () => badgeDefs.map((d) => ({ ...d, owned: state.badges.has(d.id) }));
export const listOwnedBadges = () => listBadges().filter((badge) => badge.owned);
