export function decryptPayload(encrypted: string): any {
  const raw = decodeURIComponent(escape(atob(encrypted)));
  const key = "reachout_vault_key_2026";
  let result = "";
  for (let i = 0; i < raw.length; i++) {
    result += String.fromCharCode(raw.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return JSON.parse(result);
}