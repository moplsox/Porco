# 单文件浏览器验收

## 2026-11-28 对白表情版的当前检查

当前交付index.html为80,261,224字节，SHA-256：`3ac12509ea3eed7f34caca2e1acb79ade0245c9a91ffd28de58fd87afc1a34f6`。145场景、38张内嵌图像、13张CG。`npm run test:standalone`实际classic脚本及DOM适配器检查11/11通过，新增三人六表情共18次旧缓存导入恢复，均显示新表情并保持原存档数据。源码检查另覆盖36个缺省/旧平静缓存案例。

真实浏览器复测未完成：当前浏览器工具受用量上限限制。以上不是浏览器画面、图像解码、声音或手机触控验收。下文保留早期file://受阻的历史记录，其包体与检查数量不代表当前版本。

## 早期真实浏览器尝试记录

执行：`python scripts/test-standalone.py`。目标：`file:///workspace/sites/adriatic-letters/index.html`。

时间：2026-11-25T14:49:41.065286+00:00；Chromium：156.0.8078.79；最终状态：**blocked**。

Chromium 管理员策略拒绝 file:// 导航（net::ERR_BLOCKED_BY_ADMINISTRATOR）。

使用环境现有 Python Playwright 与 `/usr/bin/chromium` 的 headless 模式，没有启动服务器、安装依赖、修改权限或绕过管理员策略。所有 HTTP/HTTPS 请求在浏览器上下文拦截并拒绝。当前拦截记录 0 条；JavaScript pageerror 0 条。导航被阻断时，这些零值不能证明应用运行正常。

| 检查 | 结果 | 说明 |
|---|---|---|
| 桌面 file:// 标题与背景图片加载 | blocked | Chromium 管理员策略拒绝 file:// 导航（net::ERR_BLOCKED_BY_ADMINISTRATOR）。 |
| 开场第一句及第一次选择 | skipped | 文件导航被环境策略阻断。 |
| 多槽存读档恢复当前对白和选择后回复 | skipped | 文件导航被环境策略阻断。 |
| 真实导出与文件导入恢复完整存档 | skipped | 文件导航被环境策略阻断。 |
| 重新载入后从继续航行恢复 | skipped | 文件导航被环境策略阻断。 |
| 可见界面完成委托并走到周四、回收传话分支 | skipped | 文件导航被环境策略阻断。 |
| 委托板、日历、设置、相册及账本入口 | skipped | 文件导航被环境策略阻断。 |
| 手机竖屏与横屏切换保持日期和对白 | skipped | 文件导航被环境策略阻断。 |
| 损坏 localStorage 仍可开局 | skipped | 文件导航被环境策略阻断。 |
| 被禁用 localStorage 使用临时存档并提示 | skipped | 文件导航被环境策略阻断。 |
| 应用运行无需 HTTP/HTTPS 且无 JavaScript 错误 | skipped | 文件导航被环境策略阻断。 |

## 截图

没有生成游戏截图：应用尚未在真实浏览器中载入，避免把错误页当作游戏画面。

## 覆盖边界

脚本通过可见DOM操作标题、对白、选项、存读档、导出/导入、日历、委托与设置。存档完整性通过用户实际导出的JSON比较，脚本不改写隐藏游戏状态。损坏与禁用 localStorage 仅用于对应故障场景。

Node VM 的 classic script 执行与静态单文件检查由 `scripts/test-standalone.mjs` 另外执行；VM 不是真实浏览器，不能证明图像解码、触控、音频、下载权限或 file:// 浏览器策略已经通过。这里的 Chromium 结果也不替代 Safari、iPhone 真机及听觉检查。

## 静态单文件与实际脚本执行

另行执行 `node scripts/test-standalone.mjs`：**7/7 通过**。它读取并执行交付 `index.html` 中的实际 classic script，不重新实现游戏逻辑；通过最小 DOM、事件与存储适配器检查启动和存档。测试中的 `fetch` 全部抛错，仍能启动游戏。

- 单文件 101,378,611 字节；没有外链脚本、样式或执行模块依赖。
- 134 场景、24 委托、8 结局和 87 张图像已内嵌；图像字节总计 75,568,798，12 张实际 CG 的图像字节均存在。
- 真实运行脚本展示首句「漏一夜才沉这么一点。你比保险公司还有耐心。」并通过已注册的渲染事件推进与选择。
- 手动槽、快速存读档、导出和导入精确恢复 `opening` 第 19 行及选择后的待续回复；使用既有存储创建全新 VM 后能继续相同位置。
- 损坏的设置、meta 和存档 JSON 不阻止开局；localStorage 抛出 `SecurityError` 时仍可使用当前会话存档并导出文件。

这里的图像检查验证内嵌数据与文件签名，不等于浏览器实际解码。VM 测试结果明确为 `browserVerification:false`；真实 file:// 画面、触控、下载权限和音频仍受上述 Chromium 管理员策略阻断，未宣称通过。

本轮film-reference-v2更新后再次执行单文件检查，7/7通过；新美术全部已内嵌。真实浏览器验证限制仍按上文保留。
