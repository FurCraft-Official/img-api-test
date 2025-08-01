
# 🎲 随机福瑞图 API

一个简单易用的福瑞图片 API 服务，提供随机图片、分类浏览和图片列表获取。

## 📷 示例预览

点击按钮可获取一张随机的福瑞图片：

```html
<img id="randomImage" alt="随机福瑞图">
<button id="refreshBtn">换一张随机图片</button>

<script>
async function loadRandomImage() {
  const img = document.getElementById('randomImage');
  img.src = '加载中占位图';

  try {
    const response = await fetch('https://img.furapi.top/api');
    if (response.redirected) {
      img.src = response.url;
    } else {
      throw new Error('未收到重定向');
    }
  } catch (error) {
    console.error('加载图片失败:', error);
    img.src = '加载失败占位图';
  }
}

document.getElementById('refreshBtn').addEventListener('click', loadRandomImage);
loadRandomImage();
</script>
```

---

## 🧪 API 使用文档

所有接口基础路径为：`https://img.furapi.top/api`

### 📌 获取随机图片

```
GET https://img.furapi.top/api
```

返回一张随机图片。

#### ➕ 可选参数

- `?json=1`：返回 JSON 格式而不是重定向，例如：

```json
{"key":"Screenshot_2025-08-01-01-37-32-586_org.telegram.messenger.jpg","size":418227,"uploaded":"2025-07-31T19:39:31.410Z","url":"https://img.furapi.top/api/Screenshot_2025-08-01-01-37-32-586_org.telegram.messenger.jpg"}
```

---

### 📁 获取某分类下的随机图片

```
GET https://img.furapi.top/A
```

将 `A` 替换为分类名（如 `fox`, `dragon`, 等）。

支持 `?json=1` 参数获取 JSON 格式返回。

---

### 📂 直接访问指定图片

```
GET https://img.furapi.top/A/1.png
```

`A` 为分类，`1.png` 为图片文件名。

---

### 📃 获取所有图片列表

```
GET https://img.furapi.top/list.json
```

返回一个 JSON 数组，包含所有图片的路径。

---

## 📚 可用分类

分类列表通过请求 `/list.json` 并提取路径中的分类名自动生成，例如：

- `fox`
- `dragon`
- `cat`
- `dog`
- ...

你也可以自己添加或管理 `list.json` 来控制分类内容。

---


## 🧾 页脚信息

```
© 2025 随机福瑞图 API | 由 FurCraft 提供支持
```

---