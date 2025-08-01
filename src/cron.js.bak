export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(updateListJson(env));
  }
};

async function updateListJson(env) {
  const list = [];
  let cursor;

  do {
    const { objects, cursor: nextCursor } = await env.IMAGES.list({ prefix: '', cursor });
    for (const obj of objects) {
      if (!obj.key.endsWith('/')) list.push(obj.key);
    }
    cursor = nextCursor;
  } while (cursor);

  await env.IMAGES.put('list.json', JSON.stringify(list, null, 2), {
    httpMetadata: { contentType: 'application/json' },
  });

  console.log(`✅ list.json updated. Total: ${list.length} images`);
}
