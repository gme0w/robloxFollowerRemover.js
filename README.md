# Roblox Followers Remover

Bulk-remove **all followers** from a Roblox account (e.g., your own) directly from the browser console.
The script uses the block → unblock trick to silently sever follow relationships without leaving anyone blocked at the end. It auto-acquires a CSRF token, paginates the entire followers list, and processes each user with adaptive retry, stall detection, and a live ETA.

> ⚠️ **Heads up:** Removing a follower who is also your **friend** will unfriend them as a side effect of the block step. The unblock at the end restores normal status, but the friendship will need to be manually re-added. Use only on accounts you own and in line with Roblox's Terms.

---

## ⚡ How to Use

1. **Log in** to your Roblox account in your browser:
   https://www.roblox.com/

2. **Open any signed-in Roblox page** (your home page works fine):
   https://www.roblox.com/home
   The script auto-detects your user ID from your session — no config needed.

3. **Open DevTools → Console**
   - Chrome / Edge: `F12` → **Console**
   - Firefox: `Ctrl+Shift+K`
   - Safari: `Cmd+Opt+C`

4. **Copy–paste the script** from the block below into the Console and press **Enter**.

5. **Leave the tab open.** Don't let your computer sleep. The script logs progress as it runs:

       [REMOVER] => 487 followers. Pace 4000ms. Est. duration 1h5m.
       [REMOVER] [42/487] (8.6%) ETA 58m — Removed someuser (12345)

6. To stop early, run this in the Console:

       __STOP_REMOVER()

---

## 🔧 Features

- **Adaptive rate-limit handling** — honors `Retry-After`, exponential backoff on 429s, auto-refreshes CSRF on 403s
- **Stall detection** — skips users that fail 3 times in a row instead of getting stuck
- **Live ETA + progress %** — knows total at start, logs estimated time remaining per action
- **CSRF auto-refresh** — token rotated every 25 minutes so long runs don't expire mid-way
- **Network-error recovery** — fetch failures retry with backoff (up to 6 attempts)
- **Clean summary** — separates "block failed" from "blocked but unblock failed" with ID lists so you can rerun or manually clean up stragglers
- **Pause button** — `__STOP_REMOVER()` halts cleanly after the current user

---

## ⚙️ Tuning

Edit the `CONFIG` block at the top of the script if needed:

| Option | Default | What it does |
|---|---|---|
| `requestDelay` | `4000` | ms between requests. Lower = faster, more 429 risk. |
| `pageSize` | `100` | followers fetched per page (max 100). |
| `maxRetries` | `6` | retry cap per failed request. |
| `stallThreshold` | `3` | failures on same user before skipping. |
| `csrfRefreshInterval` | `25 min` | how often to proactively rotate the CSRF token. |

Expected throughput at default pace: **~400 followers/hour**.

---

## 📊 Rough Time Estimates

| Followers | Estimated time |
|---|---|
| 100 | ~14 min |
| 500 | ~1.1 hr |
| 1,000 | ~2.2 hr |
| 5,000 | ~11 hr |
| 10,000 | ~22 hr |

---

## ❓ FAQ

**Will the followers be left blocked?**
No. The script blocks each user (which removes the follow) then immediately unblocks them. End state is "not following you, not blocked."

**Can I get banned?**
Automation is technically against Roblox's Terms of Service, though enforcement on scripts like this is rare. The risk scales with volume — see the warning above. Use at your own discretion.

**Why is it so slow?**
Roblox's block endpoint is rate-limited aggressively (it's an abuse-sensitive API). Going faster triggers 429 cooldowns that can lock the endpoint for minutes-to-hours, which ends up slower than just pacing conservatively.

**What if my browser/computer crashes mid-run?**
Just re-run the script. It always pulls the current top of your followers list, so anyone already removed simply won't be there anymore — no duplicates, no resume state needed.

**Will it remove followers who are also my friends?**
Yes, and it will unfriend them in the process (blocking auto-unfriends). The unblock restores normal status, but you'll need to re-send friend requests if you want them back.
