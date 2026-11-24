# QA Checklist

Legend: `[ ]` not tested, `[x]` passed (with evidence), `[!]` failed (see note), `[-]` cannot be tested by an agent (needs a real device or person).
Only mark `[x]` when you actually observed it. Put proof (screenshot name, test name, log line) after the item.

## Day 1-2: lobby and roles
- [ ] Create room shows a 6-character code, QR code and join link
- [ ] 2nd to 5th tab can join by code; duplicate name is rejected; empty name is rejected
- [ ] Join with a bad code shows "No room with that code."
- [ ] Host sees a Start button only when at least 5 players are in
- [ ] Non-host cannot start (server error NOT_HOST)
- [ ] Host can change mafia count; invalid counts rejected
- [ ] Leaving the lobby removes the player right away
- [ ] Closing a tab in the lobby frees the seat after about 30 seconds and moves host if needed
- [ ] Refreshing a tab in a started game puts the player back in the same seat (rejoin)
- [ ] After start, every player sees exactly one role; role counts match (mafia count, 1 Doctor, 1 Detective, rest Villagers)
- [ ] Role card is hidden until pressed and held; releasing hides it
- [ ] Mafia see their teammates; nobody else does
- [ ] Network/WebSocket frames for a Villager never contain another player's role (check in browser devtools or via the leak test)
- [-] Phone on same Wi-Fi opens the link and joins (real phone)
- [-] Screen stays awake on a real phone during a game

## Day 3: night phase
- [ ] ROLE_REVEAL has a countdown and moves to NIGHT by itself
- [ ] Host "Skip ahead" works; a non-host does not see the button
- [ ] NIGHT: Mafia see a target list (no Mafia in it) and teammates' picks
- [ ] NIGHT: Doctor sees alive players, cannot pick the same person two nights in a row, self-save follows the "once" rule
- [ ] NIGHT: Detective sees alive players except self and gets a private finding the next night screen
- [ ] NIGHT: Villagers see "Close your eyes" and no night controls
- [ ] Changing a pick before the night ends keeps only the latest pick
- [ ] Night does NOT end early when everyone has acted
- [ ] Kill with no Doctor save: MORNING says who died and shows their role
- [ ] Kill with a matching Doctor save: MORNING says "Nobody died."
- [ ] Nobody picked: MORNING says "Nobody died."
- [ ] Dead player sees "You are dead" on later nights and has no controls
- [ ] MORNING moves to DISCUSSION by itself
- [ ] Reaching a win after the night (only Mafia left standing level with Town) shows GAME_OVER with all roles
- [ ] Reconnect mid-night restores the same screen and the countdown is correct
- [ ] Wire-level: during NIGHT a Villager's incoming frames contain no role names

## Day 4: voting
- [ ] DISCUSSION counts down, then VOTING starts by itself
- [ ] VOTING lists alive players except yourself, plus a Skip option
- [ ] You cannot vote for yourself (server rejects)
- [ ] Dead players see the vote but cannot vote
- [ ] Changing your vote keeps only the latest
- [ ] "Waiting for: names" updates as people vote
- [ ] With publicVotes on, live picks and counts are visible to everyone
- [ ] Vote ends early as soon as every living player has voted (including skips)
- [ ] Clear winner is voted out; ELIMINATION shows the name, their role and the tally
- [ ] Tie starts a RUNOFF with only the tied players as options
- [ ] Second tie: nobody is voted out
- [ ] Nobody votes: "No votes. Nobody was voted out."
- [ ] After ELIMINATION the game goes to the next night (day number increases)
- [ ] Voting out the last Mafia ends the game: Town wins, all roles shown
- [ ] Mafia win when voting leaves them level with Town
- [ ] Host "Play again" returns everyone to the lobby with the same room code; disconnected players are dropped
- [ ] A second full game can be started and finished after a rematch
- [ ] Reconnect during VOTING restores the screen, your pick and the countdown

## Day 5: host controls and settings
- [ ] Host sees a "Game settings" panel in the lobby; non-host does not
- [ ] Changing a timer (for example Vote = 60) shows the new value for everyone and the next game uses it
- [ ] Out-of-range timer (for example 1 or 9999) is refused with a message and the old value stays
- [ ] Tie rule "Nobody out" and "Pick at random" behave as chosen in a real game
- [ ] "Show who voted for whom" off: players see who has voted but not who they picked; the result screen shows only the tally
- [ ] "Reveal role when someone dies" off: dead players' roles stay hidden until game over
- [ ] Doctor self-save "Never" and "Always" are respected at night
- [ ] Host "Remove" kicks a lobby player; they see "The host removed you", can join again, and the room list updates
- [ ] There is no Remove button for yourself or once the game has started
- [ ] Host Pause freezes the countdown for everyone and shows a "paused" banner; actions are refused while paused
- [ ] Resume continues with the time that was left (not a fresh timer)
- [ ] Skip while paused moves to the next phase and clears the pause
- [ ] A non-host never sees Pause or Skip
- [ ] Settings are kept after "Play again"
- [-] Deployed site works from a real phone on mobile data (see `docs/DEPLOY.md`)

