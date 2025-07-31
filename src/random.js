export default {
  async fetch(request, env) {
    const listResponse = await env.IMAGES.list();
    const keys = listResponse.objects.map(obj => obj.key);

    if (keys.length === 0) {
      return new Response("No images in R2 bucket", { status: 404 });
    }

    const randomKey = keys[Math.floor(Math.random() * keys.length)];

    const object = await env.IMAGES.get(randomKey);

    if (!object || !object.body) {
      return new Response("Image not found", { status: 404 });
    }

    // 你可以根据文件扩展名判断 MIME 类型（简单处理）
    const mime = randomKey.endsWith(".jpg") ? "image/jpeg"
               : randomKey.endsWith(".png") ? "image/png"
               : "application/octet-stream";

    return new Response(object.body, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=3600",
      },
    });
  },
};
