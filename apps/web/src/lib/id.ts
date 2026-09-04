/** 生成随机 UUID。
 *
 * `crypto.randomUUID()` 只在安全上下文（HTTPS 或 localhost）可用；
 * 通过 IP 走 HTTP 访问时它是 undefined，直接调用会抛异常并让整页崩溃。
 * 这里按可用性依次降级：randomUUID -> getRandomValues -> Math.random。
 */
export function randomId(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }

  // RFC 4122 v4：优先用密码学随机源
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

  const hex: string[] = [];
  for (let i = 0; i < 16; i += 1) {
    hex.push(bytes[i].toString(16).padStart(2, "0"));
  }
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}

/** 复制文本到剪贴板。
 *
 * `navigator.clipboard` 同样只在安全上下文可用；HTTP 下访问时它是 undefined，
 * 点击会静默失败。这里降级到 execCommand 兜底，返回是否复制成功。
 */
export async function copyText(text: string): Promise<boolean> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      // 继续走下面的兜底方案
    }
  }

  if (typeof document === "undefined") return false;
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
