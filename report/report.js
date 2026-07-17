(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const targetId = params.get("id") || "";
  const PRO_API = "https://europe-west1-csr-plus-331c8.cloudfunctions.net/api";
  const DISCORD_CLIENT_ID = "1526694025757851819";
  const JWT_KEY = "csrpProToken";
  const VIDEO_MAX = 50 * 1024 * 1024;
  let sndCfg = {
    soundEnabled: true,
    soundVolume: .6
  };
  try {
    const area = chrome.storage && chrome.storage.sync ? chrome.storage.sync : chrome.storage.local;
    area.get([ "soundEnabled", "soundVolume" ], d => {
      if (d && typeof d.soundEnabled === "boolean") sndCfg.soundEnabled = d.soundEnabled;
      if (d && typeof d.soundVolume === "number") sndCfg.soundVolume = d.soundVolume;
    });
  } catch {}
  const sndCache = {};
  function snd(name) {
    if (!sndCfg.soundEnabled) return;
    try {
      let a = sndCache[name];
      if (!a) {
        a = new Audio(chrome.runtime.getURL(`assets/sounds/${name}.wav`));
        sndCache[name] = a;
      }
      const n = a.cloneNode(true);
      n.volume = sndCfg.soundVolume;
      n.play().catch(() => {});
    } catch {}
  }
  let session = null;
  function pro(path, {method = "GET", body = null, token = null, timeoutMs = 0} = {}) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({
          type: "csrp:pro",
          path,
          method,
          body,
          token,
          timeoutMs
        }, resp => {
          if (chrome.runtime.lastError || !resp) return resolve({
            ok: false,
            error: "no response"
          });
          resolve(resp);
        });
      } catch (e) {
        resolve({
          ok: false,
          error: String(e)
        });
      }
    });
  }
  function siteApi(path) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({
          type: "csrp:api",
          path
        }, resp => {
          if (chrome.runtime.lastError || !resp || !resp.ok) return resolve(null);
          resolve(resp.data);
        });
      } catch {
        resolve(null);
      }
    });
  }
  function jwtExp(t) {
    try {
      return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp || 0;
    } catch {
      return 0;
    }
  }
  function tokenValid(s) {
    return !!(s && s.token && s.exp && s.exp * 1e3 > Date.now() + 3e4);
  }
  function loadSession() {
    return new Promise(resolve => {
      if (session) return resolve(session);
      try {
        chrome.storage.local.get([ JWT_KEY ], d => {
          session = d && d[JWT_KEY] || null;
          resolve(session);
        });
      } catch {
        resolve(null);
      }
    });
  }
  async function signIn(interactive = true) {
    const s = await loadSession();
    if (tokenValid(s)) return s;
    const redirectUri = chrome.identity.getRedirectURL();
    const authUrl = "https://discord.com/api/oauth2/authorize?" + new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "identify",
      prompt: "consent"
    }).toString();
    const redirect = await new Promise(resolve => {
      try {
        chrome.identity.launchWebAuthFlow({
          url: authUrl,
          interactive
        }, r => resolve(chrome.runtime.lastError ? null : r));
      } catch {
        resolve(null);
      }
    });
    if (!redirect) return null;
    const code = new URL(redirect).searchParams.get("code");
    if (!code) return null;
    const resp = await pro("/auth/exchange", {
      method: "POST",
      body: {
        code,
        redirectUri
      }
    });
    if (!resp.ok || !resp.data || !resp.data.token) return null;
    session = {
      token: resp.data.token,
      exp: jwtExp(resp.data.token),
      user: resp.data.user || null
    };
    try {
      chrome.storage.local.set({
        [JWT_KEY]: session
      });
    } catch {}
    return session;
  }
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader;
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("read failed"));
      r.readAsDataURL(file);
    });
  }
  const msg = $("#msg");
  function showErr(t) {
    msg.className = "msg err";
    msg.textContent = t;
  }
  function showOk(t) {
    msg.className = "msg ok";
    msg.textContent = t;
  }
  function bindBack() {
    $("#back-btn").addEventListener("click", () => {
      snd("click");
      if (history.length > 1) {
        const here = location.href;
        history.back();
        setTimeout(() => {
          if (location.href === here) window.close();
        }, 150);
      } else window.close();
    });
  }
  async function reflectAuth() {
    const s = await loadSession();
    const signedIn = tokenValid(s);
    $("#auth-block").hidden = signedIn;
    $("#report-form").hidden = !signedIn;
    if (signedIn && s.user && String(s.user.id) === String(targetId)) {
      $("#report-form").hidden = true;
      $("#auth-block").hidden = true;
      showErr("You cannot report your own profile.");
    }
  }
  function bindForm() {
    $("#signin-btn").addEventListener("click", async () => {
      snd("click");
      $("#signin-btn").disabled = true;
      const s = await signIn(true);
      $("#signin-btn").disabled = false;
      if (!s) return showErr("Sign-in failed or was cancelled.");
      msg.className = "msg";
      reflectAuth();
    });
    const desc = $("#description");
    desc.addEventListener("input", () => {
      $("#desc-count").textContent = `(${desc.value.length}/500)`;
    });
    $("#report-form").addEventListener("submit", async e => {
      e.preventDefault();
      const reason = $("#reason").value;
      if (!reason) return showErr("Please choose a reason.");
      if (window.CSRPConfirm) {
        const ok = await window.CSRPConfirm({
          title: "Submit this report?",
          body: `Report this player for "${reason}"? It will be sent to CSR+ moderators. Submitting false or spam reports may get you rate-limited.`,
          okLabel: "Submit report",
          danger: true
        });
        if (!ok) return;
      }
      const submit = $("#submit-btn");
      submit.disabled = true;
      msg.className = "msg";
      showOk("Submitting…");
      try {
        const payload = {
          targetId,
          reason,
          description: desc.value.slice(0, 500)
        };
        const vf = $("#video").files[0];
        const sf = $("#shot").files[0];
        if (vf) {
          if (vf.size > VIDEO_MAX) {
            submit.disabled = false;
            return showErr("Video is over 50 MB.");
          }
          payload.video = await fileToDataUrl(vf);
        } else if (sf) {
          payload.screenshot = await fileToDataUrl(sf);
        }
        const token = session && session.token || (await signIn(true) || {}).token;
        if (!token) {
          submit.disabled = false;
          return showErr("Sign in required.");
        }
        const resp = await pro("/report", {
          method: "POST",
          body: payload,
          token,
          timeoutMs: 12e4
        });
        submit.disabled = false;
        if (resp.ok) {
          showOk("✓ Report submitted. Thank you — you can close this tab.");
          $("#report-form").reset();
          $("#desc-count").textContent = "(0/500)";
        } else if (resp.status === 401) {
          showErr("Session expired — please sign in again.");
          try {
            chrome.storage.local.remove(JWT_KEY);
          } catch {}
          session = null;
          reflectAuth();
        } else {
          showErr(resp.data && resp.data.error || resp.error || "Could not submit report.");
        }
      } catch (err) {
        submit.disabled = false;
        showErr("Something went wrong. Try again.");
      }
    });
  }
  async function render() {
    bindBack();
    bindForm();
    if (!/^\d{15,21}$/.test(targetId)) {
      showErr("Invalid or missing target id.");
      return;
    }
    $("#target-id").textContent = targetId;
    siteApi(`/users/${targetId}`).then(u => {
      if (u && u.name) $("#target-line").innerHTML = `Target: <strong>${String(u.name).replace(/[<>&]/g, "")}</strong> <code>${targetId}</code>`;
    });
    await reflectAuth();
    if ($("#auth-block").hidden === false) {
      const s = await signIn(false);
      if (tokenValid(s)) reflectAuth();
    }
  }
  render();
})();
