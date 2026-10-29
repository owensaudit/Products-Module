# Ministering Visit Portal

Local portal for Elders Quorum ministering-visit outreach. It replaces the placeholder setup in this repository.

Josh Owens (EQ Assistant Secretary) logs outreach. When someone replies by text, phone, or email, the visit is recorded for the **Elders Quorum Calendar** and these presidency members:

- Mark Lillenberg — EQ President
- Tyler Sanders — EQ Counselor
- Brad Conger — EQ Counselor
- Josh Owens — EQ Assistant Secretary
- Harrison Bardo — EQ Secretary

Google Calendar is not connected. Scheduling saves the channel, the slot, and that the visit is meant for that calendar. It does not create a Google event.

## Slots

- Wednesday: 7:00 pm, 7:15 pm, 7:30 pm, 7:45 pm
- Sunday: before church, and after church
- Sacrament meeting starts at 10:30 am and concludes at 12:30 pm

## Run

```bash
npm test
npm start
```

Open http://127.0.0.1:8787.

The portal starts empty. Import a CSV export from the outreach spreadsheet, or add a person by name. A header-only template is at `/template.csv`. Imported files are not committed.

Other people on the same machine can open the site, read outreach status, and add comments. To share it on a trusted local network:

```bash
HOST=0.0.0.0 npm start
```

Do not expose this server on the public internet. There is no login. Contact details are hidden in the page until "Show contact details" is turned on, and they are stored only in `data/portal.json`.

This GitHub repository is public. `data/*.json` is gitignored so phone numbers, email addresses, and spreadsheet exports stay off the remote.

## Data

People, outreach attempts (channel, date, status, notes), month slots, scheduled visits, and comments are kept as separate records. Extra spreadsheet columns are preserved on the person instead of copying the grid as-is. Columns that look like phone, email, or address are treated as private.
