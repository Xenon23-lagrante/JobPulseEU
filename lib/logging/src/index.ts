function redact(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  const out: any = Array.isArray(obj) ? [] : {};
  const sensitive = /token|key|secret|password|credential/i;
  for (const k of Object.keys(obj)) {
    try {
      const v = obj[k];
      if (sensitive.test(k)) {
        out[k] = "[REDACTED]";
      } else if (v && typeof v === "object") {
        out[k] = redact(v);
      } else {
        out[k] = v;
      }
    } catch (e) {
      out[k] = "[UNSERIALIZABLE]";
    }
  }
  return out;
}

export function log(level: "info" | "warn" | "error" | "debug", event: string, payload?: any) {
  const p = redact(payload ?? {});
  const out = { ts: new Date().toISOString(), level, event, payload: p };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out));
}

export default { log, redact };
