export default {
  async scheduled(event, env, ctx) {
    const allFiles = [];
    let cursor;

    do {
      const { objects, cursor: nextCursor } = await env.IMAGES.list({ cursor });
      for (const obj of objects) {
        if (!obj.key.endsWith('/')) {
          allFiles.push(obj.key);
        }
      }
      cursor = nextCursor;
    } while (cursor);

    // 例如整理为 { category: [file1, file2, ...] }
    const result = {};
    for (const key of allFiles) {
      const [category, filename] = key.split('/');
      if (!filename) continue; // 排除只包含目录的 key
      if (!result[category]) result[category] = [];
      result[category].push(filename);
    }

    const json = JSON.stringify(result, null, 2);

    await env.IMAGES.put('list.json', json, {
      httpMetadata: { contentType: 'application/json' },
    });

    console.log(`✅ 已生成 list.json，分类数: ${Object.keys(result).length}`);
  }
}
