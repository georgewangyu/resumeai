"use strict";
(function () {
  let checked = false;
  let enabled = false;
  let healthPromise = null;
  const shouldProbeApi = window.location.port === "3740";

  async function checkHealth() {
    if (!shouldProbeApi) { checked = true; enabled = false; return false; }
    if (checked) return enabled;
    if (!healthPromise) {
      healthPromise = fetch("/api/health", { method: "GET", credentials: "include" })
        .then((r) => { enabled = r.ok; checked = true; return enabled; })
        .catch(() => { enabled = false; checked = true; return false; });
    }
    return healthPromise;
  }

  async function request(path, options) {
    const apiReady = await checkHealth();
    if (!apiReady) throw new Error("API backend unavailable.");
    const res = await fetch(path, {
      credentials: "include",
      ...options,
      headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(data?.error || `Request failed ${res.status}`);
    return data;
  }

  window.API = {
    checkHealth,
    isEnabledSync: () => checked && enabled,
    getSession:  ()       => request("/api/session", { method: "GET" }),
    devSignIn:   (payload)=> request("/api/auth/dev-signin", { method: "POST", body: JSON.stringify(payload || {}) }),
    signOut:     ()       => request("/api/auth/signout", { method: "POST" }),
    uploadResume:(payload)=> request("/api/resume/upload",   { method: "POST", body: JSON.stringify(payload) }),
    analyzeResume:(payload)=>request("/api/resume/analyze",  { method: "POST", body: JSON.stringify(payload) }),
    getQuestions:(payload)=> request("/api/resume/questions",{ method: "POST", body: JSON.stringify(payload) }),
    buildVariant:(payload)=> request("/api/resume/build",    { method: "POST", body: JSON.stringify(payload) }),
    checkoutSession:(payload)=>request("/api/subscription/checkout-session", { method: "POST", body: JSON.stringify(payload) }),
  };
})();
