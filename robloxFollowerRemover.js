const CONFIG = {
    requestDelay: 4000,
    pageSize: 100,
    maxRetries: 6,
    stallThreshold: 3,
    csrfRefreshInterval: 25 * 60 * 1000,
};

const state = {
    user_id: null,
    csrf_token: null,
    totalAtStart: 0,
    processed: 0,
    removed: 0,
    blockedButNotUnblocked: [],
    blockFailed: [],
    stuckCounts: {},
    startTime: Date.now(),
    lastCsrfRefresh: Date.now(),
    stopped: false,
};

window.__STOP_REMOVER = () => { state.stopped = true; console.log("[REMOVER] Stop requested — will halt after current user."); };

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const fmtTime = (ms) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}h${m}m` : m > 0 ? `${m}m${sec}s` : `${sec}s`;
};

const refreshCsrf = async () => {
    try {
        const r = await fetch("https://auth.roblox.com/v2/logout", {method: "POST", credentials: "include"});
        const token = r.headers.get("x-csrf-token");
        if (token) {
            state.csrf_token = token;
            state.lastCsrfRefresh = Date.now();
            console.log("[REMOVER] CSRF token refreshed.");
        }
    } catch (e) { console.log(`[REMOVER] CSRF refresh failed: ${e.message}`); }
};

const apiCall = async (action, follower, attempt = 0) => {
    if (Date.now() - state.lastCsrfRefresh > CONFIG.csrfRefreshInterval) await refreshCsrf();

    let response;
    try {
        response = await fetch(`https://apis.roblox.com/user-blocking-api/v1/users/${follower.id}/${action}`, {
            method: "POST",
            headers: {"X-CSRF-TOKEN": state.csrf_token, "Content-Type": "application/json"},
            credentials: "include",
            body: "{}"
        });
    } catch (e) {
        if (attempt < CONFIG.maxRetries) {
            const wait = Math.min(60000, 3000 * Math.pow(2, attempt));
            console.log(`[REMOVER] Network error on ${action} ${follower.id}: ${e.message}. Retrying in ${wait}ms.`);
            await sleep(wait);
            return apiCall(action, follower, attempt + 1);
        }
        return {ok: false, status: 0};
    }

    if (response.ok) return {ok: true, status: response.status};

    if (response.status === 403) {
        const newToken = response.headers.get("x-csrf-token");
        if (newToken && attempt < 3) {
            state.csrf_token = newToken;
            return apiCall(action, follower, attempt + 1);
        }
    }

    if (response.status === 429 && attempt < CONFIG.maxRetries) {
        const retryAfter = parseInt(response.headers.get("retry-after") || "0", 10);
        const wait = retryAfter > 0 ? retryAfter * 1000 : Math.min(180000, 10000 * Math.pow(2, attempt));
        console.log(`[REMOVER] 429 on ${action} ${follower.id}. Cooling ${fmtTime(wait)} (attempt ${attempt + 1}/${CONFIG.maxRetries}).`);
        await sleep(wait);
        return apiCall(action, follower, attempt + 1);
    }

    return {ok: false, status: response.status};
};

const progressLog = (msg) => {
    const elapsed = Date.now() - state.startTime;
    const rate = state.processed > 0 ? elapsed / state.processed : 0;
    const remaining = Math.max(0, state.totalAtStart - state.processed);
    const eta = rate > 0 ? fmtTime(rate * remaining) : "?";
    const pct = state.totalAtStart > 0 ? ((state.processed / state.totalAtStart) * 100).toFixed(1) : "0";
    console.log(`[REMOVER] [${state.processed}/${state.totalAtStart}] (${pct}%) ETA ${eta} — ${msg}`);
};

const removeFollower = async (follower) => {
    const blockResult = await apiCall("block-user", follower);
    if (!blockResult.ok) {
        state.blockFailed.push(follower.id);
        progressLog(`BLOCK FAILED for ${follower.name} (${follower.id}) status=${blockResult.status}`);
        return false;
    }

    await sleep(CONFIG.requestDelay);

    const unblockResult = await apiCall("unblock-user", follower);
    if (!unblockResult.ok) {
        state.blockedButNotUnblocked.push(follower.id);
        progressLog(`UNBLOCK FAILED for ${follower.name} (${follower.id}) status=${unblockResult.status} — still blocked but follow removed`);
    } else {
        state.removed += 1;
        progressLog(`Removed ${follower.name} (${follower.id})`);
    }
    return true;
};

const getFollowerCount = async () => {
    const r = await fetch(`https://friends.roblox.com/v1/users/${state.user_id}/followers/count`, {credentials: "include"});
    const j = await r.json();
    return j.count || 0;
};

const getNextPage = async () => {
    const r = await fetch(`https://friends.roblox.com/v1/users/${state.user_id}/followers?limit=${CONFIG.pageSize}&sortOrder=Asc`, {credentials: "include"});
    if (!r.ok) throw new Error(`Followers fetch failed: ${r.status}`);
    return (await r.json()).data || [];
};

const run = async () => {
    try {
        state.csrf_token = document.querySelector('meta[name="csrf-token"]')?.getAttribute("data-token");
        if (!state.csrf_token) await refreshCsrf();
        if (!state.csrf_token) { console.log("[REMOVER] Unable to obtain CSRF Token."); return; }

        const {UserId} = await (await fetch("https://www.roblox.com/my/account/json", {credentials: "include"})).json();
        state.user_id = UserId;

        state.totalAtStart = await getFollowerCount();
        if (state.totalAtStart === 0) { console.log("[REMOVER] No followers to remove."); return; }

        const estTotal = fmtTime(state.totalAtStart * CONFIG.requestDelay * 2);
        console.log(`[REMOVER] => ${state.totalAtStart} followers. Pace ${CONFIG.requestDelay}ms. Est. duration ${estTotal}.`);
        console.log(`[REMOVER] => To stop early, run: __STOP_REMOVER()`);

        while (!state.stopped) {
            let page;
            try {
                page = await getNextPage();
            } catch (e) {
                console.log(`[REMOVER] Page fetch error: ${e.message}. Sleeping 10s and retrying.`);
                await sleep(10000);
                continue;
            }

            if (page.length === 0) {
                const liveCount = await getFollowerCount();
                if (liveCount === 0) break;
                console.log(`[REMOVER] Empty page but count=${liveCount}. Sleeping 10s.`);
                await sleep(10000);
                continue;
            }

            for (const f of page) {
                if (state.stopped) break;

                const seen = state.stuckCounts[f.id] || 0;
                if (seen >= CONFIG.stallThreshold) {
                    progressLog(`Skipping stuck user ${f.id} after ${seen} attempts.`);
                    state.processed += 1;
                    continue;
                }

                state.processed += 1;
                const success = await removeFollower(f);
                if (!success) state.stuckCounts[f.id] = seen + 1;

                await sleep(CONFIG.requestDelay);
            }
        }

        const dur = fmtTime(Date.now() - state.startTime);
        console.log(`[REMOVER] => Finished in ${dur}.`);
        console.log(`[REMOVER]    Successfully removed: ${state.removed}`);
        console.log(`[REMOVER]    Block failed:        ${state.blockFailed.length}`);
        console.log(`[REMOVER]    Stuck blocked:       ${state.blockedButNotUnblocked.length}`);
        if (state.blockedButNotUnblocked.length) console.log(`[REMOVER]    Blocked IDs (unblock manually): ${state.blockedButNotUnblocked.join(", ")}`);
        if (state.blockFailed.length) console.log(`[REMOVER]    Block-failed IDs: ${state.blockFailed.join(", ")}`);
    } catch (error) {
        console.error(`[REMOVER] Fatal: ${error}`);
    }
};

run();
