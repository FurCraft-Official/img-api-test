export default {
  async fetch(request, env, ctx) {
    const { IMAGES } = env;

    // 获取所有对象的列表
    const list = await IMAGES.list();

    if (!list.objects.length) {
      return new Response("No images found", { status: 404 });
    }

    // 从中随机挑选一张
    const randomIndex = Math.floor(Math.random() * list.objects.length);
    const imageObject = list.objects[randomIndex];

    const imageName = imageObject.key;
    const imageData = await IMAGES.get(imageName);

    if (!imageData) {
      return new Response("Image not found", { status: 404 });
    }

    const url = new URL(request.url);

    if (url.searchParams.get("json") === "1") {
      // 返回 JSON 格式
      const imageUrl = `${url.origin}/random?name=${encodeURIComponent(imageName)}`;
      return Response.json({ name: imageName, url: imageUrl });
    }

    // 直接返回图片内容
    return new Response(imageData.body, {
      headers: {
        "Content-Type": imageData.httpMetadata?.contentType || "image/jpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  },
};
