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

async function updateListJson(env) {
  const structure = {};
  let cursor;

  do {
    const { objects, cursor: nextCursor } = await env.IMAGES.list({ cursor });
    for (const obj of objects) {
      if (obj.key.endsWith("/")) continue;

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

  console.log("✅ list.json 已更新（含上传时间 + 目录树结构）");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 手动刷新 list.json 接口，使用请求头 Authorization 鉴权
    if (url.pathname === "/update-list") {
      const authHeader = request.headers.get("Authorization");
      if (authHeader !== `Bearer ${env.ADMIN_TOKEN}`) {
        return new Response("Unauthorized", { status: 403 });
      }

      await updateListJson(env);
      return new Response("list.json 手动刷新成功", { status: 200 });
    }

    // 访问 list.json，返回 R2 里的文件内容
    if (url.pathname === "/list.json") {
      const listObject = await env.IMAGES.get("list.json");
      if (!listObject) {
        return new Response("list.json not found", { status: 404 });
      }
      return new Response(listObject.body, {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 随机图片 API
    if (url.pathname.startsWith("/api")) {
      const wantJson = url.searchParams.get("json") === "1";

      const list = await env.IMAGES.list({ limit: 100 });
      if (!list || list.objects.length === 0) {
        return new Response("No images in R2 bucket", { status: 404 });
      }

      const random = list.objects[Math.floor(Math.random() * list.objects.length)];
      const object = await env.IMAGES.get(random.key);
      if (!object) {
        return new Response("Failed to load image", { status: 500 });
      }

      if (wantJson) {
        return new Response(
          JSON.stringify({
            key: random.key,
            size: random.size,
            uploaded: random.uploaded,
            url: `${url.origin}/api/${random.key}`,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(object.body, {
        headers: {
          "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
        },
      });
    }

    // 静态资源请求
    try {
      return await getAssetFromKV({ request, waitUntil: ctx.waitUntil });
    } catch (err) {
      return new Response("Not found", { status: 404 });
    }
  },
};
