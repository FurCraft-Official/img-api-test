
# 🎲 随机福瑞图 API

一个简单易用的福瑞图片 API 服务，提供随机图片、分类浏览和图片列表获取。

## 📷 示例

在html上可获取一张随机的福瑞图片：

```html
<img src=https://img.furapi.top/api>
```
或者直接访问<https://img.furapi.top/api>


## 🧪 API 使用文档

所有接口基础路径为：`https://img.furapi.top/api`

### 📌 获取随机图片

```
GET https://img.furapi.top/api
```

返回一张所有分类的随机图片。

#### ➕ 可选参数

- `?json=1`：返回 JSON 格式而不是图片，分类也支持随机json，例如：

<https://img.furapi.top/api/party?json=1>
<br>
格式：
```json
{"key":"Screenshot_2025-08-01-01-37-32-586_org.telegram.messenger.jpg","size":418227,"uploaded":"2025-07-31T19:39:31.410Z","url":"https://img.furapi.top/api/Screenshot_2025-08-01-01-37-32-586_org.telegram.messenger.jpg"}
```



### 📂 直接访问指定图片

```
GET https://img.furapi.top/A/1.png
```

`A` 为分类，`1.png` 为图片文件名。


### 📃 获取所有图片列表

```
GET https://img.furapi.top/list.json
```

返回一个 JSON 数组，包含所有文件的路径以及修改时间。


## 📚 可用分类

分类列表通过请求 `/list.json` 并提取路径中的分类名自动生成，例如：

- `fox`
- `dragon`
- `cat`
- `dog`
- ...
<br>
分类列表的格式为目录树格式 
<pre>
{
  "目录": {
    "文件1": "修改时间",
    "文件2": "修改时间",
    "...": ""
  },
  "目录2": {
    "文件1": "...",
    "...": ""
  }
}
</pre>
参考<https://img.furapi.top/list.json>
<br>

注：本api为cloudflare workers构建，每日访问量有限

<br>


© 2025 随机福瑞图 API | 由 FurCraft 提供支持
