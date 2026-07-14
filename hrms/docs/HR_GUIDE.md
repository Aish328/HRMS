# Meridian HRMS — Guide for HR (no technical background needed)

This guide walks you through starting the system and doing everyday HR work. You only need to do the "One-time setup" once.

---

## Part 1 — One-time setup (about 10 minutes)

### Step 1. Install Node.js
Node.js is the free program that runs the HRMS on your computer.

1. Open your web browser and go to **nodejs.org**.
2. Click the big green **LTS** download button.
3. Open the downloaded file and click **Next / Continue** through the installer, accepting the defaults.

### Step 2. Start the HRMS
1. Open the **hrms** folder you received.
2. **On Windows:** double-click the file called **start-windows.bat**.
   **On Mac:** open the Terminal app (press Cmd+Space, type "Terminal"), type `cd ` (with a space), drag the hrms folder into the window, press Enter, then type `./start-mac-linux.sh` and press Enter.
3. A black window opens and prints progress. The **first time takes a few minutes** (it downloads what it needs). When you see **"HRMS server running"**, it's ready.
4. Leave that black window open — it *is* the system. Closing it stops the HRMS.

### Step 3. Open the app and sign in
1. Open your browser and go to: **http://localhost:4000**
2. Sign in as the administrator:
   - Email: **admin@company.com**
   - Password: **admin123**
3. The system comes with sample employees and attendance so you can explore safely.

> **Important:** before real use, change the admin password. Sample employee accounts (like arjun@company.com / emp123) can be deleted from the Employees page once you've added your real staff.

---

## Part 2 — Everyday work (Admin)

### Add a real employee
1. Click **Employees** in the left menu.
2. Click **Add employee** (top right).
3. Fill in the name, a code like EMP101, their email, and pick a department.
4. Leave the password blank — the system assigns **welcome123** and shows it in a green message. Share it with the employee; they can change it later from their Profile page.
5. Click **Add employee**.

### Check who is in today
- The **Dashboard** shows Present / Absent / On leave the moment you sign in.
- Click **Attendance** to see the full list for any date, with a **map** of where people punched in.
- Click **Review** on any row to see the punch-in and punch-out selfies side by side. A red shield with a low percentage means the two photos look different — take a closer look.

### Approve or reject leave
1. Click **Leaves**. Pending requests appear first.
2. Read the reason, then click **Approve** or **Reject**.
3. You can add a short note — the employee sees it instantly in their app.
4. Approved leave is automatically deducted from the employee's balance.

### Download reports (for payroll or audits)
1. Click **Reports**.
2. Pick the date range, then click **Download CSV** (opens in Excel) or **Download PDF**.

### Other useful things
- The **bell icon** (top right) shows new punches, leave requests and verification flags.
- **Activity log** shows everything that happened — who signed in, who punched, what you approved.
- The **moon/sun icon** switches between dark and light mode.

---

## Part 3 — What employees do (share this with staff)

Employees open the **same address** (see "phones" note below) on their phone browser and sign in with the email and password you gave them.

**To punch in:**
1. Tap **Punch** at the bottom.
2. Tap **Open camera** and allow camera + location when the phone asks.
3. Look at the camera and **blink or turn your head slightly** — the oval turns green when the system confirms you're a live person (a photo of a photo won't work).
4. Tap **Capture selfie**, check it, then **Confirm punch in**.
5. Punching out at the end of the day is the same. Working hours are calculated automatically.

**To request leave:** tap **Leaves** → **Apply**, choose the type and dates, write a reason, send. The status updates to Approved/Rejected as soon as you decide.

**Phones:** browsers only allow the camera on a secure address. On the office computer, http://localhost:4000 works as-is. To let phones use it, ask anyone slightly technical to follow the two-line "Using it from a phone" section in README.md — it takes about a minute.

---

## Part 4 — Routine care

- **Starting each day:** if the black window was closed, just run the start file again. Your data is safe — it lives in the `server/data` and `server/uploads` folders.
- **Backing up:** copy the whole **hrms** folder (or just `server/data` and `server/uploads`) to a USB drive or cloud folder weekly.
- **Fresh demo data / start over:** delete the file `server/data/hrms.db` and run the start file again — it reloads the sample data. (This erases everything, so only do this before real use.)

## If something looks wrong

| Problem | Fix |
|---|---|
| Browser says "can't connect" | The black window isn't running — run the start file again. |
| "Camera access is required" | In the browser's address bar, click the lock/camera icon and set Camera to Allow, then retry. |
| Employee forgot their password | Employees → pencil icon on their row → type a new password in "Reset password" → Save. |
| A page looks stuck | Refresh the browser (F5). |
