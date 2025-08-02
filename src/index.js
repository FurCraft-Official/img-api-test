import { getAssetFromKV } from "@cloudflare/kv-asset-handler";

let imageIndex = null;
let indexLoadedAt = 0;
const INDEX_TTL = 60 * 60 * 1000; // 1 小时

/**
 * 格式化为上海时间
 */
function formatShanghaiTime(dateStr) {
  const date = new Date(dateStr);
  const options = {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  };
  const parts = new Intl.DateTimeFormat("zh-CN", options).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value.padStart(2, "0");
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/**
 * 判断 key 是否为图片文件
 */
function isImage(key) {
  return (
    /\.(png|jpe?g|gif|webp)$/i.test(key) &&
    !key.endsWith("/") &&
    key !== "list.json"
  );
}

/**
 * 遍历 R2，生成或更新 list.json
 */
async function updateListJson(env) {
  const structure = {};
  let cursor = undefined;

  do {
    const { objects, cursor: nextCursor } = await env.IMAGES.list({ cursor });
    for (const obj of objects) {
      if (!isImage(obj.key)) continue;
      const parts = obj.key.split("/");
      const timestamp = formatShanghaiTime(obj.uploaded);

      let current = structure;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (i === parts.length - 1) {
          current[p] = timestamp;
        } else {
          current[p] = current[p] || {};
          current = current[p];
        }
      }
    }
    cursor = nextCursor;
  } while (cursor);

  await env.IMAGES.put(
    "list.json",
    JSON.stringify(structure, null, 2),
    { httpMetadata: { contentType: "application/json" } }
  );
  console.log("✅ list.json 已更新");
}

/**
 * 加载并内存缓存 list.json
 */
async function loadImageIndex(env) {
  if (imageIndex && Date.now() - indexLoadedAt < INDEX_TTL) {
    return imageIndex;
  }
  const raw = await env.IMAGES.get("list.json");
  if (!raw) throw new Error("list.json not found");
  imageIndex = JSON.parse(await raw.text());
  indexLoadedAt = Date.now();
  return imageIndex;
}

/**
 * 扁平化嵌套结构为 key 列表
 */
function flattenKeys(struct, prefix = "") {
  return Object.entries(struct).flatMap(([key, val]) => {
    const path = prefix + key;
    if (typeof val === "string") return [path];
    return flattenKeys(val, path + "/");
  });
}

/**
 * 随机选
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 从 R2 取资源并加上 Cache-Control
 */
async function fetchFromR2(env, key, wantJson, originUrl) {
  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response("Not found", { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });

  if (wantJson) {
    const meta = {
      key,
      size: obj.size,
      uploaded: obj.uploaded,
      url: `${originUrl}/api/${key}`,
    };
    return new Response(JSON.stringify(meta), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return new Response(obj.body, {
    status: 200,
    headers: {
      "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const wantJson = url.searchParams.get("json") === "1";

    // 1. 手动刷新索引
    if (pathname === "/update-list") {
      const auth = request.headers.get("Authorization");
      if (auth !== `Bearer ${env.ADMIN_TOKEN}`) {
        return new Response("Unauthorized", { status: 403, headers: { "Access-Control-Allow-Origin": "*" } });
      }
      ctx.waitUntil(updateListJson(env));
      return new Response("✅ 正在异步刷新 list.json", {
        status: 202,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // 2. 返回 list.json
    if (pathname === "/list.json") {
      const listObj = await env.IMAGES.get("list.json");
      if (!listObj) {
        return new Response("list.json not found", {
          status: 404,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
      return new Response(listObj.body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // 3. 图片 API，不缓存随机端点
    if (pathname.startsWith("/api")) {
      const segments = pathname.split("/").filter(Boolean).slice(1);
      let targetKey;

      try {
        const idx = await loadImageIndex(env);

        if (segments.length === 0) {
          // 全库随机，每次都重新挑
          targetKey = pickRandom(flattenKeys(idx));
        } else {
          // 指定目录随机
          const prefix = segments.join("/") + "/";
          const candidates = flattenKeys(idx).filter((k) => k.startsWith(prefix));
          if (!candidates.length) {
            return new Response("分类中无图片", {
              status: 404,
              headers: { "Access-Control-Allow-Origin": "*" },
            });
          }
          targetKey = pickRandom(candidates);
        }

        // 直接从 R2 取，不走 caches.default
        return await fetchFromR2(env, targetKey, wantJson, url.origin);

      } catch (e) {
        return new Response(e.message, {
          status: 500,
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    // 4. 静态资源走 KV asset handler
    try {
      return await getAssetFromKV({ request, waitUntil: ctx.waitUntil });
    } catch {
      return new Response("Not found", {
        status: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  },
};
