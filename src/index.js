import { getAssetFromKV } from "@cloudflare/kv-asset-handler";

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

function isImage(key) {
  return (
    /\.(png|jpe?g|gif|webp)$/i.test(key) &&
    !key.endsWith("/") &&
    key !== "list.json"
  );
}

async function updateListJson(env) {
  const structure = {};
  let cursor;

  do {
    const { objects, cursor: nextCursor } = await env.IMAGES.list({ cursor });
    for (const obj of objects) {
      if (obj.key.endsWith("/")) continue;
      if (obj.key === "list.json") continue;

      const parts = obj.key.split("/");
      const timestamp = formatShanghaiTime(obj.uploaded);

      if (parts.length === 1) {
        if (!structure["_root"]) structure["_root"] = {};
        structure["_root"][parts[0]] = timestamp;
      } else {
        let current = structure;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          if (i === parts.length - 1) {
            current[part] = timestamp;
          } else {
            if (!current[part]) current[part] = {};
            current = current[part];
          }
        }
      }
    }
    cursor = nextCursor;
  } while (cursor);

  const jsonOutput = JSON.stringify(structure, null, 2);
  await env.IMAGES.put("list.json", jsonOutput, {
    httpMetadata: { contentType: "application/json" },
  });

  console.log("✅ list.json 已更新");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // ✅ 手动刷新 list.json
    if (pathname === "/update-list") {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${env.ADMIN_TOKEN}`) {
        return new Response("Unauthorized", { status: 403 });
      }
      await updateListJson(env);
      return new Response("list.json 手动刷新成功", { status: 200 });
    }

    // ✅ 获取 list.json
    if (pathname === "/list.json") {
      const listObject = await env.IMAGES.get("list.json");
      if (!listObject) {
        return new Response("list.json not found", { status: 404 });
      }
      return new Response(listObject.body, {
        headers: { "Content-Type": "application/json" },
      });
    }

    // ✅ 图片 API 路由逻辑
    if (pathname.startsWith("/api")) {
      const wantJson = url.searchParams.get("json") === "1";
      const parts = pathname.split("/").filter(Boolean); // e.g. ['api', 'cat', '1.jpg']
      const afterApi = parts.slice(1);

      // /api -> 所有图中随机
      if (afterApi.length === 0) {
        const list = await env.IMAGES.list({ limit: 1000 });
        const files = list.objects.filter(obj => isImage(obj.key));
        if (files.length === 0) return new Response("No images", { status: 404 });

        const random = files[Math.floor(Math.random() * files.length)];
        const object = await env.IMAGES.get(random.key);
        if (!object) return new Response("Failed to load image", { status: 500 });

        if (wantJson) {
          return new Response(JSON.stringify({
            key: random.key,
            size: random.size,
            uploaded: random.uploaded,
            url: `${url.origin}/api/${random.key}`,
          }), { headers: { "Content-Type": "application/json" } });
        }

        return new Response(object.body, {
          headers: {
            "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
          },
        });
      }

      const key = afterApi.join("/");
      const object = await env.IMAGES.get(key);
      if (object) {
        // 访问 /api/<完整路径>
        return new Response(object.body, {
          headers: {
            "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
          },
        });
      } else {
        // 访问 /api/<分类> → 随机返回该目录下图片
        const prefix = `${afterApi[0]}/`;
        const list = await env.IMAGES.list({ prefix });
        const candidates = list.objects.filter(obj => isImage(obj.key));
        if (candidates.length === 0) return new Response("分类中无图片", { status: 404 });

        const random = candidates[Math.floor(Math.random() * candidates.length)];
        const obj = await env.IMAGES.get(random.key);
        if (!obj) return new Response("无法加载图片", { status: 500 });

        if (wantJson) {
          return new Response(JSON.stringify({
            key: random.key,
            size: random.size,
            uploaded: random.uploaded,
            url: `${url.origin}/api/${random.key}`,
          }), { headers: { "Content-Type": "application/json" } });
        }

        return new Response(obj.body, {
          headers: {
            "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
          },
        });
      }
    }

    // ✅ 静态资源
    try {
      return await getAssetFromKV({ request, waitUntil: ctx.waitUntil });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  },
};
