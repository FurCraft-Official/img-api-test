function formatShanghaiTime(dateStr) {
  const date = new Date(dateStr);
  const options = {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  const formatter = new Intl.DateTimeFormat('zh-CN', options);
  const parts = formatter.formatToParts(date);

  const get = (type) => parts.find(p => p.type === type)?.value.padStart(2, '0');

  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

export default {
  async scheduled(event, env, ctx) {
    const structure = {};
    let cursor;

    do {
      const { objects, cursor: nextCursor } = await env.IMAGES.list({ cursor });
      for (const obj of objects) {
        if (obj.key.endsWith('/')) continue;

        const parts = obj.key.split('/');
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
      httpMetadata: { contentType: "application/json" }
    });

    console.log("✅ list.json 已按 Asia/Shanghai 时区生成完成");
  }
}
