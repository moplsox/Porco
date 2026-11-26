# 原参考角色美术接入验收

执行：`python scripts/test-reference-art.py --baseline cf42651`。时间：2026-11-26T02:35:45.071553+00:00。结果：**8/8 项通过，passed**。

本检查以正式 `assets/manifest.json` 与游戏实际载入的六份剧情为准。它不修改代码、清单、剧情或图片，也不重新生成构建产物。

| 检查 | 结果 | 未通过原因 |
|---|---|---|
| 启用film-reference-v2且旧SVG人物与旧setting不再active | 通过 |  |
| 48立绘slot对应42独立PNG，Gina工作别名映射正确 | 通过 |  |
| 42独立人物PNG完整可读、RGBA透明区与画布尺寸一致 | 通过 |  |
| 七套独立衣装各有六张不同文件与不同像素的表情图 | 通过 |  |
| 每个场景衣装映射及人物对白表情均能解析active PNG | 通过 |  |
| 12张active CG均为实际PNG且内容SHA不同于替换前版本 | 通过 |  |
| 首航、天气图、夜花园及厨房/晚餐前后衣装绑定一致 | 通过 |  |
| 用户参考PDF和本地参考目录未进入active资源清单 | 通过 |  |

## 人物文件

Active 人物清单 48 个slot，引用 42 个独立文件。Gina 的work六slot应与morning六slot共享同一组PNG，其余七套服装各有六个独立表情文件。透明度检查要求RGBA、至少有完全透明像素和可见像素；图像文件均通过PNG读取校验。

| 人物 | 独立服装 | 已验证文件 | 画布尺寸 | 不同文件SHA数 |
|---|---|---:|---|---:|
| fio | work | 6 | 1024×1536 | 6 |
| fio | date | 6 | 1024×1536 | 6 |
| fio | flight | 6 | 1024×1536 | 6 |
| gina | morning | 6 | 1024×1536 | 6 |
| gina | date | 6 | 1024×1536 | 6 |
| gina | stage | 6 | 1024×1536 | 6 |
| porco | work | 6 | 1024×1536 | 6 |

## CG实际内容替换

下表逐个读取当前PNG，并同 `git show cf42651:资源路径` 得到的替换前二进制比较。SHA变化只证明文件内容改变，不证明电影风格、人物相似程度或逐像素复现参考图。不同表情的像素SHA也只证明像素不同，不替代对情绪和表情的人工判断。

| CG | 替换前SHA256前16位 | 当前SHA256前16位 | 文件内容 |
|---|---|---|---|
| dinner-fio | bd5f2e0f1af21cd9… | 413b195abc09dc05… | 已改变 |
| dock | 1c9597e76869bfe6… | 73e2c8800f2565bb… | 已改变 |
| first-flight | 7ad083c0a0600777… | 2a3b31a6e9b15417… | 已改变 |
| garden | 4a24506e460cf1eb… | 5ca50bf5cdbff450… | 已改变 |
| key | bb4c7b70a356561b… | a22be1dd28887c9f… | 已改变 |
| kitchen | e3ddf627e553d8cc… | a703708d486f5413… | 已改变 |
| last-boat | 4f98854a4a4be050… | 83b073e6b4b30bcd… | 已改变 |
| letter | 10f3b35b7d291397… | 04c02818af74c79b… | 已改变 |
| mailbag | 5e57375bc2200982… | a2b6aa065787d5cd… | 已改变 |
| silence | 15db59d7cdb4e059… | e20d43c3e210d1d2… | 已改变 |
| storm | 4b1e31e78728c67d… | f56d532c47ce8c3e… | 已改变 |
| yellow-quilt | 19b8e29cc99596b4… | fc7f77a2fe031c5b… | 已改变 |

## 关键剧情绑定

| 场景 | 时间 | CG | 人物衣装 |
|---|---|---|---|
| common_d66_gap | 第66天 / 上午 | storm | fio: work, gina: morning |
| common_d81_firstflight | 第81天 / 上午 | first-flight | fio: flight |
| gina_d04 | 第51天 / 夜晚 | garden | gina: morning |
| gina_d01 | 第9天 / 夜晚 | kitchen | gina: stage |
| gina_d02 | 第21天 / 夜晚 | silence | gina: morning |
| gina_e10 | 第70天 / 上午 | key | gina: morning |
| fio_d02 | 第24天 / 夜晚 | dinner-fio | fio: date |
| fio_d02_after | 第0天 / 夜晚 | 延续对白 | fio: date |
| opening | 第1天 / 上午 | letter | fio: flight |
| common_d89_boat | 第89天 / 夜晚 | last-boat | fio: work, gina: date |

## 相关剧情检查

主代理已另外执行正式剧情/引擎检查。现有 `data/audit.json` 记录：19/19 项通过，状态 `passed`；134 个场景、111,087 个去重正文字符，其中汉字 99,888 字。本美术脚本仅读取该既有记录，没有重跑剧情或浏览器检查。

## 视觉复核与隐私边界

角色脸型、发型、胡须颜色、画线与平涂方向，以及CG中的视线、服装、鞋、钥匙、船桨等细节，仍由人工对照用户提供的电影参考审阅。本脚本不把哈希或版本字段当作视觉风格合格证。原参考PDF和提取参考图仅保留在本地工作区，不随游戏公开；本报告只记录active清单与项目目录未引用原PDF及本地参考路径。

本次美术审计未重试已确认的浏览器策略：真实 `file://` 导航此前被 Chromium 管理员策略以 `ERR_BLOCKED_BY_ADMINISTRATOR` 阻止；没有绕过策略，也没有宣称浏览器视觉、触控或音频已经通过。此前的单文件静态/VM检查与真实浏览器限制见 [STANDALONE-QA.md](STANDALONE-QA.md)。
