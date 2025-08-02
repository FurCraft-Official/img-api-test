import { getAssetFromKV } from "@cloudflare/kv-asset-handler";

// 提升正则表达式为常量，避免重复编译
const IMAGE_REGEX = /\.(png|jpe?g|gif|webp)$/i;

// 创建全局DateTimeFormat实例，避免重复创建
const SHANGHAI_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatShanghaiTime(dateStr) {
  const date = new Date(dateStr);
  const parts = SHANGHAI_FORMATTER.formatToParts(date);
  
  // 使用Map缓存查找结果
  const valueMap = new Map();
  for (const part of parts) {
    valueMap.set(part.type, part.value.padStart(2, "0"));
  }
  
  return `${valueMap.get("year")}-${valueMap.get("month")}-${valueMap.get("day")} ${valueMap.get("hour")}:${valueMap.get("minute")}:${valueMap.get("second")}`;
}

function isImage(key) {
  return IMAGE_REGEX.test(key) && key !== "list.json";
}

// 添加list.json缓存
let listJsonCache = null;
const CACHE_TTL = 300000; // 5分钟缓存

async function updateListJson(env) {
  const structure = {};
  let cursor;

  do {
    const { objects, cursor: nextCursor } = await env.IMAGES.list({ cursor });
    for (const obj of objects) {
      // 跳过目录和list.json
      if (obj.key.endsWith("/") || obj.key === "list.json") continue;
      
      const parts = obj.key.split("/");
      const timestamp = formatShanghaiTime(obj.uploaded);

      let current = structure;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        current[part] = current[part] || {};
        current = current[part];
      }
      
      const lastPart = parts[parts.length - 1];
      current[lastPart] = timestamp;
    }
    cursor = nextCursor;
  } while (cursor);

  const jsonOutput = JSON.stringify(structure, null, 2);
  await env.IMAGES.put("list.json", jsonOutput, {
    httpMetadata: { contentType: "application/json" },
  });
  
  // 更新缓存
  listJsonCache = {
    data: jsonOutput,
    timestamp: Date.now()
  };

  console.log("✅ list.json 已异步更新");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const wantJson = url.searchParams.get("json") === "1";

    // ✅ 手动刷新 list.json
    if (pathname === "/update-list") {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${env.ADMIN_TOKEN}`) {
        return new Response("Unauthorized", { 
          status: 403, 
          headers: { "Access-Control-Allow-Origin": "*" } 
        });
      }

      ctx.waitUntil(updateListJson(env));
      return new Response("✅ 已启动异步刷新 list.json，请稍后访问", { 
        status: 202, 
        headers: { "Access-Control-Allow-Origin": "*" } 
      });
    }

    // ✅ 获取 list.json (带缓存)
    if (pathname === "/list.json") {
      // 检查缓存是否有效
      if (listJsonCache && Date.now() - listJsonCache.timestamp < CACHE_TTL) {
        return new Response(listJsonCache.data, {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          }
        });
      }
      
      const listObject = await env.IMAGES.get("list.json");
      if (!listObject) {
        return new Response("list.json not found", { 
          status: 404, 
          headers: { "Access-Control-Allow-Origin": "*" } 
        });
      }
      
      // 更新缓存
      listJsonCache = {
        data: listObject.body,
        timestamp: Date.now()
      };
      
      return new Response(listObject.body, {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    // ✅ 图片 API
    if (pathname.startsWith("/api")) {
      const parts = pathname.split("/").filter(Boolean).slice(1);
      const key = parts.join("/");

      // 处理根目录随机图片
      if (parts.length === 0) {
        return this.handleRandomImage(null, env, url, wantJson);
      }
      
      // 尝试直接获取文件
      const fileObject = await env.IMAGES.get(key);
      if (fileObject) {
        return this.handleImageResponse(fileObject, key, wantJson, url.origin);
      }

      // 处理目录随机图片
      const prefix = key.endsWith("/") ? key : `${key}/`;
      return this.handleRandomImage(prefix, env, url, wantJson);
    }

    // ✅ 静态资源
    try {
      return await getAssetFromKV({ request, waitUntil: ctx.waitUntil });
    } catch {
      return new Response("Not found", { 
        status: 404, 
        headers: { "Access-Control-Allow-Origin": "*" } 
      });
    }
  },
  
  // 处理随机图片逻辑
  async handleRandomImage(prefix, env, url, wantJson) {
    let cursor;
    const files = [];
    const startTime = Date.now();

    do {
      const { objects, cursor: next } = await env.IMAGES.list({
        prefix,
        cursor,
        limit: 100 // 减少每次请求的数量
      });
      
      for (const obj of objects) {
        if (isImage(obj.key)) {
          files.push(obj);
        }
      }
      cursor = next;
      
      // 超时保护（1500ms）
      if (Date.now() - startTime > 1500) break;
    } while (cursor);

    if (files.length === 0) {
      return new Response(prefix ? "分类中无图片" : "No images", { 
        status: 404, 
        headers: { "Access-Control-Allow-Origin": "*" } 
      });
    }

    const random = files[Math.floor(Math.random() * files.length)];
    const object = await env.IMAGES.get(random.key);
    if (!object) {
      return new Response("无法加载图片", { 
        status: 500, 
        headers: { "Access-Control-Allow-Origin": "*" } 
      });
    }

    if (wantJson) {
      return new Response(JSON.stringify({
        key: random.key,
        size: random.size,
        uploaded: random.uploaded,
        url: `${url.origin}/api/${random.key}`
      }), { 
        headers: { 
          "Content-Type": "application/json", 
          "Access-Control-Allow-Origin": "*" 
        } 
      });
    }

    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=86400", // 添加浏览器缓存
        "Access-Control-Allow-Origin": "*",
      }
    });
  },
  
  // 处理图片响应
  handleImageResponse(object, key, wantJson, origin) {
    if (wantJson) {
      return new Response(JSON.stringify({
        key,
        size: object.size,
        uploaded: object.uploaded,
        url: `${origin}/api/${key}`
      }), { 
        headers: { 
          "Content-Type": "application/json", 
          "Access-Control-Allow-Origin": "*" 
        } 
      });
    }

    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=86400", // 添加浏览器缓存
        "Access-Control-Allow-Origin": "*",
      }
    });
  }
};