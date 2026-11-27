# 审阅美术与泳装剧情接入验收

执行：`python3 scripts/test-reference-art.py --baseline 5722c7a7e1a4418f526ebb3b3db268bee288acd7`。时间：2026-11-27T14:33:19.524540+00:00。结果：**11/11 项通过，passed**。

检查读取正式清单、六份剧情、PNG及声明视区，不修改图片。Gina work仅别名morning；12张原审阅sheet含恢复的旧草帽以固定SHA256和凭据核对，仅干泳装局部修改有独立凭据；全身基底与局部表情仅在运行时SVG组合。区域像素SHA证明画面不同，不保证表情演技、脸型或电影风格。

| 检查 | 结果 | 未通过原因 |
|---|---|---|
| 立绘启用fullbody-parts-v12，背景CG保留film-review-v10 | 通过 |  |
| 90立绘slot对应13套全身基底和78独立表情组合 | 通过 |  |
| 12张认可原图含旧草帽字节不变，仅干泳装修改有SHA凭据 | 通过 |  |
| 全身原像素基底不变，局部表情层的轮廓/矩阵与运行时绘制合法 | 通过 |  |
| 13套衣装各六种局部表情，切换不裁掉身体也不更换站姿 | 通过 |  |
| 十一地点33个16:9背景视区排除审阅标签与D测试格 | 通过 |  |
| 所有剧情衣装映射与对白表情均能解析资源 | 通过 |  |
| 13张正式CG：六张原样保留、六张替换、泳装新增 | 通过 |  |
| 本轮仅换立绘，v10的背景、CG和标题原值及图片字节未变 | 通过 |  |
| 13张相册CG均绑定正文，泳装CG与立绘均有剧情展示 | 通过 |  |
| 参考PDF与本地参考路径没有进入正式资源 | 通过 |  |

## CG保留与替换

保留图允许原版本标记不变；保留与替换按二进制比较，泳装CG为新增正式剧情图。

| CG | 基线SHA256前16位 | 当前SHA256前16位 | 状态 |
|---|---|---|---|
| dinner-fio | 413b195abc09dc05 | 413b195abc09dc05 | preserved |
| dock | 73e2c8800f2565bb | 9224b09e8c2b642a | replaced |
| fio-swimming | 新增 | aa28db7d959f11d7 | added |
| first-flight | 2a3b31a6e9b15417 | 76d710c131ce825c | replaced |
| garden | 5ca50bf5cdbff450 | 17d02806ad417164 | replaced |
| key | a22be1dd28887c9f | a22be1dd28887c9f | preserved |
| kitchen | a703708d486f5413 | a703708d486f5413 | preserved |
| last-boat | 83b073e6b4b30bcd | 83b073e6b4b30bcd | preserved |
| letter | 04c02818af74c79b | 3e7b6b838d9f8d45 | replaced |
| mailbag | a2b6aa065787d5cd | 0ec23e0d18f77df9 | replaced |
| silence | e20d43c3e210d1d2 | 9580293ccfbf5b4a | replaced |
| storm | f56d532c47ce8c3e | f56d532c47ce8c3e | preserved |
| yellow-quilt | fc7f77a2fe031c5b | fc7f77a2fe031c5b | preserved |

## 验证范围

11地点/33个16:9背景视区、13套全身基底/90槽/78个表情组合、13张独立CG、指定六张CG字节保留与泳装剧情绑定。Pillow仅在内存读取区域进行像素分析，没有保存或修改图像。

此脚本不运行浏览器，也不将文件/哈希检查称为触控、版式或电影风格验收。真实浏览器验证由主代理单独报告。
