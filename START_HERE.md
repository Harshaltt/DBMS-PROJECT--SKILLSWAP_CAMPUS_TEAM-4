# START HERE: run and present SkillSwap Campus

## 1. One-time setup (Windows, Command Prompt)

1. Extract the zip, then open Command Prompt **inside the `skillswap-campus` folder**
   (open the folder in File Explorer, click the address bar, type `cmd`, press Enter).
2. Copy your **`.env.local`** file from your old project folder into this folder.
   It holds your Neon `DATABASE_URL` and `JWT_SECRET`. It is not in the zip on purpose (secrets are never shipped).
   No `.env.local`? Copy `.env.example` to `.env.local` and paste your Neon connection string into `DATABASE_URL`.
3. Install the packages (needs internet, takes 1 to 3 minutes):
   ```
   npm install
   ```

## 2. Every time before you present (about 2 minutes)

```
npm run db:setup
npm run dev
```
Open **http://localhost:3000**. `db:setup` rebuilds the database with fresh demo data. The bookings are
relative to "now", so run it on the day you present.

If Neon says the branch is archived or the connection resets: open the Neon SQL Editor and run
`SELECT 1;` to wake it up, or switch to a phone hotspot (college Wi-Fi can block port 5432).

## 3. What to have open

| Window | What |
|---|---|
| Browser | http://localhost:3000 (use a Guest window to avoid Chrome password pop-ups) |
| Command Prompt | in the project folder, for `npm run db:test` (24/24 PASS) |
| `docs/er_diagram_chen.pdf` | ER diagram (Chen notation) |
| `docs/relational_schema.png` | ER-to-relational mapping |
| `docs/SkillSwap_Campus_Final_Report.pdf` | the report |

The full demo script with what to say, and viva answers, is in **`DEMO_GUIDE.md`**.

## 4. Demo logins (password `Password@123`)

| Role | E-mail |
|---|---|
| Admin | admin@campus.edu |
| Staff | ramesh.iyer@campus.edu |
| Student | harsh@campus.edu |
| Student | chirag@campus.edu |

The login page has one-click buttons for these.

## 5. Useful commands

| Command | What it does |
|---|---|
| `npm run db:setup` | Reset the database with demo data and embeddings |
| `npm run dev` | Start the website on port 3000 |
| `npm run db:test` | 24 database integrity tests (all should PASS) |
| `node scripts/search-demo.mjs "sing indian classical music"` | Keyword vs semantic vs hybrid search in the terminal |
| `npm run test:api` | 51 end-to-end API checks (needs `npm run dev` running; run `npm run db:setup` again afterwards) |
