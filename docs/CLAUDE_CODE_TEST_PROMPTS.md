# Claude Code test prompts

Paste one prompt into Claude Code at the repo root after each build day. Each one tests that day (and re-checks earlier days), then ticks `docs/QA_CHECKLIST.md`.

## Shared setup (every prompt uses this)
```
npm install
npm run typecheck && npm run test
FAST_PHASES=1 npm run dev        # server :3001 (phases are 4-20 seconds), client :5173
```
Dev tabs use sessionStorage, so **each browser tab is a separate player**.

---

## Day 4 prompt (voting, runoff, elimination, win check, play again)

```text
You are the QA engineer for the Mafia Night repo. Read AGENTS.md and docs/QA_CHECKLIST.md first.
Goal: test everything from Days 1-4 and tick the checklist honestly. Do NOT change source code. If you find a bug, record it, do not fix it.

Rules for the checklist
- [x] only if you saw it happen. Add proof after the item: screenshot file, test name, or log line.
- [!] if it failed. Add a one-line note and put full details in docs/QA_REPORT.md (steps, expected, actual, screenshot).
- [-] if it needs a real phone or a real person. Leave those for the human.
- Never tick an item from reading code alone.

Step 1: automated checks
1. Run `npm run typecheck`, `npm run test`, `npm run build`. Paste the pass counts into docs/QA_REPORT.md.
2. Start the app: `FAST_PHASES=1 npm run dev` (in the background). Wait for http://localhost:3001/healthz to return ok.

Step 2: protocol-level game script (fast and repeatable)
Write a throwaway script in /tmp/qa (NOT in the repo) using socket.io-client that creates a room with 7 players and plays full games. Use it to verify the rule items: night kill, Doctor save, no-pick night, tie -> runoff -> second tie, no votes, early end when all voted, win by voting out the last Mafia, Mafia win when level with Town, rematch and a second game. Also record every frame a Villager receives and assert no foreign role name appears before a death or GAME_OVER.

Step 3: real UI in Chrome (use the Claude in Chrome tools; load them with ToolSearch first)
1. Call tabs_context_mcp, then open 5 NEW tabs at http://localhost:5173. Resize the window to 390x844 to match a phone.
2. Tab 1 creates a room. Tabs 2-5 join with the code. Check the lobby items, including the QR and bad code / duplicate name errors.
3. Start the game. In each tab press and hold the role card (left_mouse_down, read the page text, left_mouse_up) and note every player's role. Check the Mafia teammate line and that holding is required.
4. Play through: ROLE_REVEAL -> NIGHT (act as each role) -> MORNING -> DISCUSSION -> VOTING -> ELIMINATION -> next NIGHT. Take a screenshot of every screen and name them day4-<screen>-<tab>.png in ./qa-evidence/.
5. Test reconnect: reload one tab during NIGHT and one during VOTING. Confirm the same seat, screen, pick and a correct countdown.
6. Finish a game, click "Play again" as host, and play a second game.

Step 4: mobile emulation
- If Xcode is installed, boot an iOS simulator (`xcrun simctl list devices`, `xcrun simctl boot`, open Safari to http://<your LAN IP>:5173, set ALLOW_LAN as in `npm run dev`). If Android Studio is installed, do the same with an emulator and Chrome. Join one player from the emulator and play at least one night and one vote. Screenshot it.
- If neither exists, say so in the report and leave the item as [-].

Step 5: report
- Update docs/QA_CHECKLIST.md in place.
- Write docs/QA_REPORT.md: summary table (passed / failed / not testable), every bug with steps and screenshots, and a list of things you could not verify.
- Finish with a short message: counts, the 3 worst bugs if any, and what the human still has to check on a real phone.
```

---

## Day 5 prompt (settings, kick, pause)

```text
You are the QA engineer for the Mafia Night repo. Read AGENTS.md, docs/QA_CHECKLIST.md and docs/QA_REPORT.md (it may hold earlier findings). Do NOT change source code; record bugs in docs/QA_REPORT.md.
Test the "Day 5" section fully, and re-run a quick regression of Days 1-4 (one full game to GAME_OVER plus a rematch).
Rules: [x] only with proof (screenshot name, test name, log line). [!] for failures with details in the report. [-] for things needing a real phone or the deployed site. Never tick from reading code.

1. Run `npm run typecheck`, `npm run test`, `npm run build`. Put the counts in the report. Start `FAST_PHASES=1 npm run dev` in the background.
2. Protocol script in /tmp/qa with socket.io-client (7 players): send valid and invalid `host:settings` payloads (timers at, below and above the limits, floats, strings, unknown keys, wrong tieRule/doctorSelfSave, non-boolean publicVotes), as host and as a non-host, in LOBBY and after start. Test `host:kick` (self, unknown id, non-host, after start), and `host:pause` (non-host, in lobby, pause, act while paused, resume, skip while paused). Assert the pause really stops the phase timer by waiting longer than the phase length.
3. Real UI in Chrome (Claude in Chrome tools, load with ToolSearch; or Chrome DevTools tools if that is what is available): 5 tabs at 390x844.
   - Open the settings panel as host. Change Vote to 60, set tie rule to "Nobody out", turn "Show who voted for whom" off, turn "Reveal role when someone dies" off. Check a non-host tab shows no settings panel and the host's tab shows the saved values after a reload.
   - Kick one player with the Remove button; confirm they see the removal message, can rejoin, and the other tabs update.
   - Play a game with those settings. Confirm: vote screen hides who picked whom, a tie leaves nobody out, dead players' roles are hidden until game over.
   - Pause during NIGHT and during VOTING: banner shows for all, the countdown freezes, buttons for night/vote are refused with a message, resume continues from the remaining time.
   - Do "Play again" and confirm the settings are still the ones you chose.
4. Screenshots into ./qa-evidence/ named day5-<screen>-<tab>.png.
5. If an iOS simulator or Android emulator exists, join one player from it and test pause/resume once. Otherwise leave it [-] and say why.
6. Update the checklist, write the report (summary table, every bug with steps, what you could not verify), and finish with counts and the worst bugs.
```

---

## Day 3 prompt (night phase) - use this if you never ran a QA pass on Day 3

```text
You are the QA engineer for the Mafia Night repo. Read AGENTS.md and docs/QA_CHECKLIST.md. Test only the "Day 1-2" and "Day 3" sections. Do not change source code; record bugs in docs/QA_REPORT.md.
Tick items as [x] only with proof, [!] for failures, [-] for things needing a real phone. Never tick from reading code.

1. Run typecheck, test and build. Start `FAST_PHASES=1 npm run dev` in the background.
2. Use the Claude in Chrome tools (ToolSearch to load them): open 5 tabs at http://localhost:5173 at 390x844, create a room in tab 1, join in tabs 2-5, start, and find each player's role by holding the role card.
3. Play ROLE_REVEAL -> NIGHT -> MORNING -> DISCUSSION. Cover: Mafia kill, Doctor save, nobody picked, changing a pick, night not ending early, Doctor no-repeat rule, Detective finding, dead player view, host skip, reload mid-night.
4. Screenshots go in ./qa-evidence/ named day3-<screen>-<tab>.png.
5. In the browser devtools network/WebSocket frames (or with a socket.io-client script in /tmp/qa), confirm a Villager never receives another player's role during NIGHT.
6. If an iOS simulator or Android emulator exists, join one player from it and do one night. Otherwise leave that item [-].
7. Update the checklist, write docs/QA_REPORT.md, and finish with counts and the worst bugs.
```
