# 单文件离线版兼容性复核

本记录针对“保存一个index.html，双击后直接在浏览器游玩”的交付形式。仅只读检查现有app.js、engine.js、audio.js、CSS及资源manifest，并确认当前环境已有测试能力；未改动应用源码、图片或构建脚本。最终离线包应按下方清单另外验收。

## 必须处理的依赖

1. **ES Modules**：当前index.html用`type="module" src="src/app.js"`，app再import engine/audio。file://通常不会授予这些模块跨不透明源加载权限。将引擎、声音、应用按依赖顺序合并成同一内联经典脚本（建议IIFE与strict mode），删除import/export。不能通过关闭浏览器安全策略来证明可直接打开。
2. **JSON fetch**：app的load含4处fetch调用点，分别覆盖六份剧情、jobs、manifest和audit。离线版必须先读取内嵌数据并直接初始化scenes/jobs/art/stats，不能在file://分支继续执行任何fetch。服务器版本可以保留原加载路径。
3. **图片与图标**：manifest有44个背景条目、42个立绘条目及12个CG。它们包含相同文件的别名。favicon、标题封面与bgFor的封面fallback还直接写在index/app内，不能仅转换manifest。内联资产应按唯一原始路径去重编码一次，再在运行时引用。
4. **脚本内嵌转义**：使用JSON.stringify嵌入剧本时，将`<`编码成`\u003c`，避免以后剧本出现`</script>`时提前关闭HTML脚本节点。图片SVG使用base64可避免属性引用与引号问题。

## 存读档与设置

现有app对大部分localStorage读写有try/catch；audio.js的顶层设置读取及saveSettings没有保护。file://、隐私策略或损坏的设置JSON可在应用load前抛异常，导致整个离线包不启动。

建议共用一个存储适配器：首先尝试localStorage，拒绝时使用内存Map，设置解析失败则回到defaults。内存模式仍应允许开始、推进、选项与导入导出；存档页说明当前记录只能保持在本窗口，提示导出JSON。不要让存储限制阻止完整游玩。

file://持久化范围由浏览器决定，通常与文件路径或浏览器资料关联。改文件名、移动位置、换浏览器后可能看不到旧槽位，因此导出/导入是离线版迁移进度的可靠途径。禁止存储的浏览器中无法保证关闭后自动恢复，这是环境权限限制，不能由单个HTML绕过。

## 字体、声音与文件操作

- CSS没有`@import`、`@font-face`或url依赖。中文字体现用Songti SC/PingFang SC及Noto/STSong/SimSun等本机fallback，离线可正常排版；不同系统字形与断行会略有差异。
- 声音由WebAudio的噪声、振荡器和音量节点实时合成，没有音频文件fetch。应在“开始/继续/声音”点击手势中创建或resume AudioContext；可补webkitAudioContext兼容。没有音频权限时仍应继续游玩。
- 导出使用Blob、URL.createObjectURL与download；导入使用File.text，不依赖HTTP服务。应实测导出能落成JSON、再导入后恢复当前sceneId、lineIndex、pending、经济与全部标记。Safari上可将临时下载anchor插入DOM后再点击，延迟撤销Object URL。
- iPhone的“文件”预览与真正浏览器的执行环境不同。桌面Chrome/Safari直接打开HTML与手机在文件管理器预览不能视为同一项通过；手机触控与离线文件启动应分别报告实际测试范围。

## 图片体积与无损方案

原始PNG资产约77MiB，全部base64会增加约三分之一。若继续重复写入别名，单文件容易超过GitHub单文件限制。

建议仅为离线包将PNG重编码为lossless WebP，仓库保留原PNG/SVG。每个唯一文件只编码一次；manifest中同源别名在运行时解析。校验重编码前后的解码尺寸、RGBA及透明度；完全透明像素的不可见RGB可规范化再比较。最终包需记录实际大小，并确认小于100MiB。

## 已有测试能力

当前环境已确认存在：

- Chromium：`/usr/bin/chromium`
- Python Playwright及`playwright.sync_api`
- Node.js

可直接以headless Playwright加载`file:///绝对路径/index.html`。不需要启动HTTP服务或安装浏览器，也不要添加`--allow-file-access-from-files`或`--disable-web-security`。

## 最终包验收建议

1. 正常浏览器安全设置下加载file://，标题出现且无pageerror；开始后第一句对白、选项及立绘能显示。
2. 捕获requestfailed与请求URL：不得存在http/https请求，不得再请求外部JSON、JS、CSS、PNG或SVG文件。
3. 在正常localStorage下存档、刷新、继续；在localStorage抛SecurityError时仍能开始游玩并导出；设置JSON损坏时仍能启动。
4. 导出JSON再导入，验证对白位置、pending、日期、现金、燃油、关系、约定与剧情标记保持一致。
5. 解锁至少一张CG并进入相册，检查图片naturalWidth与解码成功；标题及背景的data URI也要检测。
6. 1440px桌面与390px竖屏分别检查对白、选项、存档页；切换尺寸不丢进度。
7. 点击后确认AudioContext为running，静音/独立音量/关闭打字音可用；音频被拒绝时不阻止剧情。
8. 将HTML复制到一个没有assets/src/data相邻目录的位置再运行，确认确实只有这一个文件即可游玩。
