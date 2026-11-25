# 浏览器验收状态

本地 Sites 预览命令曾返回 `relay could not open browser port 4173: timed out waiting for relay readiness`，随后 status 为 stopped。没有绕过预览基础设施另开服务。

纯引擎的完整路线模拟、场景与资源审计、存档序列化恢复与实际UI处理函数独立复核均有对应报告。真实浏览器操作记录将在部署后追加；没有完成的检查不会标为通过。

## 部署后检查

私有站点已成功发布：
https://adriatic-letters-porco.cheekyigloo32.chatgpt.site

云浏览器访问到该地址，显示“Log in to access / Continue with ChatGPT”。没有更改站点受众，也没有操作登录。因而此次未能完成真实浏览器中的剧情操作、桌面截图或iPhone界面实测。用户可使用自己的ChatGPT账户打开私有入口。

自动验收为19/19通过，完整时间顺序运行菲尔、吉娜、友情路线并验证八结局及三种掉信回响。另对真实UI处理函数做VM独立复核，已确认选项防重入、pending保存、不同条件台词已读识别，以及对白期间不能覆盖当前场景。自动路线模拟不等同于人工浏览器操作。
