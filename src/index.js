import { getAssetFromKV } from "@cloudflare/kv-asset-handler";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 如果路径以 /api 开头，处理为图片 API
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
            url: `${url.origin}/api/${random.key}`
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(object.body, {
        headers: {
          "Content-Type": object.httpMetadata?.contentType || "application/octet-stream"
        }
      });
    }

    // 默认处理：返回静态网页
    try {
      return await getAssetFromKV({ request, waitUntil: ctx.waitUntil });
    } catch (err) {
      return new Response("Not found", { status: 404 });
    }
  }
};
