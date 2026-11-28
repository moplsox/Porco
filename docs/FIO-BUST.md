# 菲儿立绘显示 v20

当前版本 `native-bust-expressions-v20`：六套服装的 neutral 继续显示 v19 全身大立绘，文件字节保持不变；smile、serious、sad、surprise、tired 改为原认可图集中的完整头肩像，共30张独立透明PNG。

头肩像直接保留原图的头发、脸、颈部、肩膀和服装，不再将表情部件贴到全身图上。仅处理纸底透明度和边缘残色，保留浅色衣服、眼睛高光及湿发水滴。游泳前、游泳后仍是两套独立素材。

头肩像使用独立的显示尺寸，肩部裁切藏在对话框后；neutral 沿用全身大立绘尺寸。左右位置、对白框透明度、其他角色、背景、CG和剧情保持现状。

- [30张头肩像来源、裁切、最终SHA与透明度审核](FIO-BUST.json)
- [逐图脸部、白衣与透明度复核](FIO-BUST-QA.json)
- [认可原图完整裁切坐标](FIO-BUST-REGIONS.json)
- [保留的neutral母版凭据](FIO-NATIVE.json)

`python3 scripts/export-fio-busts.py` 从既有认可图集导出头肩像，不调用图像生成服务。`python3 scripts/test-fio-native.py` 核对六张neutral未变、30张头肩像像素来源、透明通道以及42个游戏槽位的格式；离线与托管测试核对实际渲染入口。
