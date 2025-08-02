export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 📦 缓存优化的list.json获取
    if (pathname === "/list.json") {
      try {
        const cachedList = await getCachedList(env);
        if (!cachedList) {
          return quickErrorResponse("list.json not found", 404);
        }
        
        return new Response(JSON.stringify(cachedList), {
          headers: {
            ...CACHE_HEADERS,
            "Content-Length": JSON.stringify(cachedList).length
          }
        });
      } catch (error) {
        return quickErrorResponse("Failed to load list.json", 500);
      }
    }

    // 🖼️ 优化的图片API
    if (pathname.startsWith("/api")) {
      const wantJson = url.searchParams.has("json");
      
      try {
        // 使用优化的随机选择
        const randomImage = await getRandomImage(env);
        if (!randomImage) {
          return quickErrorResponse("No images available", 404);
        }

        const imageObject = await env.IMAGES.get(randomImage.key);
        if (!imageObject) {
          return quickErrorResponse("Image not found", 404);
        }

        if (wantJson) {
          const imageInfo = {
            key: randomImage.key,
            size: randomImage.size,
            uploaded: randomImage.uploaded,
            url: `${url.origin}/api/${randomImage.key}`
          };
          
          return new Response(JSON.stringify(imageInfo), {
            headers: CACHE_HEADERS
          });
        }

        // 返回优化的图片响应
        return streamResponse(imageObject);
        
      } catch (error) {
        return quickErrorResponse("Failed to process request", 500);
      }
    }

    // 静态资源处理保持不变
    try {
      return await getAssetFromKV({ request, waitUntil: ctx.waitUntil });
    } catch {
      return quickErrorResponse("Not found", 404);
    }
  }
};