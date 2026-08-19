// Base64 + XOR Scrambling (या CryptoJS AES)
export function encryptPayload(data: object): string {
  const jsonStr = JSON.stringify(data);
  const key = "reachout_vault_key_2026";
  let result = "";
  for (let i = 0; i < jsonStr.length; i++) {
    result += String.fromCharCode(jsonStr.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return btoa(unescape(encodeURIComponent(result)));
}