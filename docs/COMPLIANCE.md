# Compliance and Legal Notes

Not legal advice. This is a hobby game for friends. The goal is to collect almost nothing and say so clearly.

## 1. Personal data inventory
| Data | Where | Kept | Purpose |
|---|---|---|---|
| Display name | Server memory | Until room deleted | Show in game |
| Role and actions | Server memory | Until room deleted | Run game |
| Rejoin token (hash) | Server memory, token in player's browser | Until room deleted | Keep seat |
| Live voice audio | WebRTC via LiveKit | **Not recorded** | Talk during game |
| IP address | Hosting and LiveKit logs | Provider default | Operating the service |
| Game history (v3 only) | Postgres | Until deleted | Stats |

No accounts, email, phone, location, ads or analytics in v1.

## 2. Processors
| Provider | Role | Check |
|---|---|---|
| Render, Vercel | Hosting, logs | Provider privacy terms |
| LiveKit Cloud | Voice media relay | Confirm recording is off, check data region |
| Supabase or Neon (v3) | History storage | Region and deletion |

## 3. Consent and notice
Show once on join: "Voice is live and not recorded. Only your name is shared with players in the room."
- Ask for mic permission only when joining voice.
- Let anyone play without voice.
- **Ask:** are any friends under 18? If yes, keep data minimal (already the case) and tell parents if relevant.

## 4. India: DPDP Act 2023
- I believe the Act exempts processing for purely personal or domestic purposes, which a friends-only hobby likely is. **Verify this and the current rules status before any public launch.**
- If you open the game publicly: add a privacy notice, a way to delete data, and a contact email.

## 5. GDPR and EU AI Act
- Friends-only in India: GDPR is unlikely to apply. If EU users join, apply the same minimal-data approach and add a notice.
- EU AI Act: no AI system is built, only optional TTS. Likely no obligations. Re-check if AI bots or generative narration are added.

## 6. Rights and deletion (if ever public)
| Need | How |
|---|---|
| Delete my data | Rooms auto-delete. For v3 history, delete rows by name or profile |
| Access my data | Export my `game_players` rows |
| Complaint contact | Owner email, to be added |

## 7. Content and conduct
- Add a "report or kick" host control.
- Narrator lines must not target real people in hurtful ways.

## 8. Review triggers
Re-run this checklist when: accounts are added, game goes public, recording is added, history storage starts, or AI-generated content is introduced.
