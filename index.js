export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const wantJson = url.searchParams.get("json") === "1";

    // 获取 R2 桶里文件列表，最多 100 个
    const listResponse = await env.IMAGES.list({ limit: 100 });
    const objects = listResponse.objects;

    if (objects.length === 0) {
      return new Response("No images found in R2 bucket", { status: 404 });
    }

    // 随机选一个文件
    const randomIndex = Math.floor(Math.random() * objects.length);
    const randomObject = objects[randomIndex];

    if (wantJson) {
      // 返回 JSON
      return new Response(
        JSON.stringify({
          key: randomObject.key,
          size: randomObject.size,
          uploaded: randomObject.uploaded,
          url: `https://${url.host}/${randomObject.key}`
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 返回图片文件流
    const object = await env.IMAGES.get(randomObject.key);

    if (!object) {
      return new Response("Image not found", { status: 404 });
    }

    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      },
    });
  },
};
