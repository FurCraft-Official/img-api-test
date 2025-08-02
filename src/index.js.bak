import { getAssetFromKV } from "@cloudflare/kv-asset-handler";

// 预编译正则表达式
const IMAGE_REGEX = /\.(png|jpe?g|gif|webp)$/i;

// 创建全局DateTimeFormat实例
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
  
  // 使用查找表提高效率
  const valueMap = {};
  for (const part of parts) {
    valueMap[part.type] = part.value.padStart(2, "0");
  }
  
  return `${valueMap.year}-${valueMap.month}-${valueMap.day} ${valueMap.hour}:${valueMap.minute}:${valueMap.second}`;
}

function isImage(key) {
  return IMAGE_REGEX.test(key) && key !== "list.json";
}

// 添加内存缓存
let listJsonCache = null;
const CACHE_TTL = 300000; // 5分钟缓存

async function updateListJson(env) {
  const structure = {};
  let cursor;

  do {
    const { objects, cursor: nextCursor } = await env.IMAGES.list({ cursor });
    for (const obj of objects) {
      if (obj.key.endsWith("/") || obj.key === "list.json") continue;
      
      const parts = obj.key.split("/");
      const timestamp = formatShanghaiTime(obj.uploaded);

      let current = structure;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        current[part] = current[part] || {};
        current = current[part];
      }
      
      current[parts[parts.length - 1]] = timestamp;
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
        return this.handleRandomImage(undefined, env, url, wantJson);
      }
      
      // 尝试直接获取文件
      const fileObject = await env.IMAGES.get(key);
      if (fileObject) {
        return this.handleImageResponse(fileObject, key, wantJson, url.origin);
      }

      // 处理目录随机图片 - 修复错误：确保prefix是字符串或undefined
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
  
  // 处理随机图片逻辑 - 修复prefix处理
  async handleRandomImage(prefix, env, url, wantJson) {
    let cursor;
    const files = [];
    const startTime = Date.now();

    do {
      // 修复: 确保prefix是字符串或undefined
      const listOptions = { cursor, limit: 100 };
      if (prefix && typeof prefix === "string") {
        listOptions.prefix = prefix;
      }

      const { objects, cursor: next } = await env.IMAGES.list(listOptions);
      
      // 优化: 使用高效过滤
      for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
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

    // 优化: 使用高效随机选择
    const randomIndex = Math.floor(Math.random() * files.length);
    const random = files[randomIndex];
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