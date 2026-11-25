# 成年菲尔线：专属事件与延迟回响

菲尔现年25岁。恋爱与私生活邀约均发生于本次成年重逢之后。所有安排保留她作为独立飞机设计师的职业责任、签字权、工资支出与秋季米兰工作。18场专属事件，6场有独立起因、意外、玩家行动和后续记忆的约会；每章3场事件与1场约会，章节密度相近。

正文按实际JSON lines.text去重统计21878字符，汉字19645（不含选项、反馈、标题、界面）；条件行使用可满足标记。具体全项目数以scripts/audit.mjs报告为准。

| 最初行动/场景 | 记忆标记 | 延迟回收场景 | 实际差异 |
|---|---|---|---|
| 第2天如实说横风下目前不能载客，fio_e01 | honestLog、fioHonestLog | fio_e03（17天）、fio_e10（67天） | 交接记录能指向防波柱；谈米兰合同时要求同样真实的意见 |
| 第5天交齐记录/先吃饭不交，fio_e02 | fioLogsDelivered、fioMissedLog | fio_e03、fio_e04、fio_e09 | 工作分配与正式附件只采用已归档内容，亲密不代替记录 |
| 第17天仍只陪吃饭、不交记录，fio_e03 | fioMissedLogTwice | fio_e09（62天）、fio_e11（77天） | 咖啡和饭桌仍留位，布鲁诺列为首航驾驶员，返程仍能交给玩家 |
| 第17天补能交接的记录，fio_e03 | fioRecordsRecovered | fio_e09 | 别的驾驶员已能复核记录，停飞不只依赖“相信我们” |
| 渡轮上共同看到黄被子，fio_d01 | yellowQuilt | fio_e06（36天）、fio_e12（83天） | 邮袋对应具体屋顶的人；秋季租房讨论晒被子的屋顶 |
| 渡轮上共享安静，fio_d01 | fioQuietFerry | fio_d06（86天） | 她明确知道沉默无需不断寻找有趣话题 |
| 晚餐先问她是否愿意答工作问题，fio_d02 | voiceGiven | fio_e07（47天）、fio_e08（52天） | 责任通知由她签，技能手册也要交还给工友；不替她说漂亮话 |
| 晚餐下班边界/替她讲话，fio_d02 | fioDinnerPrivate、fioDinnerSpokenFor | fio_e14（28天） | 补裙子时分别谈私人晚饭或怎样提前保护下一次晚饭 |
| 买桃子并种桃核，fio_d03 | fioPeachPit | fio_d05（70天）、fio_e11（77天） | 不每天挖未来检查；窗台出现写名字的花盆 |
| 尺背写下留给工作的边界，fio_d04 | fioRuler | fio_e10（67天）、fio_d06（86天） | 米兰合同旁放尺；不是绳索，仍被带去工作使用 |
| 敲击判断方法写清以便交接，fio_e08 | fioManualShared | fio_e11（77天） | 西站机械师实际照手册发现松铆钉，不靠波鲁克在场 |
| 工具借用表也为自己签字，fio_e13 | fioBorrowList | fio_e15（43天） | 借号码簿无需提醒归还，减少抄写员往返 |
| 裁缝处让工友按权限处理工作，fio_e14 | fioDelegateAfternoon | fio_e15 | 维修电话由工友负责合适范围，菲尔不当唯一负责人 |
| 为她的秋季米兰职业计划留实际见面安排，fio_e10 | fioCareer、fioDistancePlanned或fioLongingSpoken | fio_e12、fio_e18和结局引擎 | 工作合同寄出，恋爱并不要求她放弃事业；好结局必须fioCareer |
| 电影之后买票，fio_d05 | fioCinemaTicket | fio_d06 | 票夹在日常钱包，不被封存为纪念品 |
| 灯塔野餐亲吻/慢慢来/尚未想好，fio_d06 | fioKiss、fioSlowYes、fioBoundarySpoken | fio_e18（88天） | 分别回收酸梅酱、耐心与不以送别强逼答复 |

## 场景表

| 章 | 事件 | 约会 |
|---|---|---|
| 1 | fio_e01 操纵杆上没有礼貌；fio_e02 领薪水的人也要下班；fio_e13 工具箱里空着的一格 | fio_d01 星期天的渡轮，8里拉，半天 |
| 2 | fio_e03 一只空出来的驾驶座；fio_e04 签名下面的擦痕；fio_e14 裙子送去补之前 | fio_d02 试飞后的晚餐，22里拉，一晚 |
| 3 | fio_e05 她住的那一间；fio_e06 两把椅子与七只邮袋；fio_e15 地图背面的电话号码 | fio_d03 两只桃子与一段路，2里拉，半天 |
| 4 | fio_e07 没有人替她作证的一次改图；fio_e08 不必每一次都坐进来；fio_e16 返工的工时谁来付 | fio_d04 屋顶上的一把尺，免费，半天 |
| 5 | fio_e09 今天不飞的那一格；fio_e10 不能替她寄出的回信；fio_e17 回程电报，不必附病假条 | fio_d05 散场以后才买票，4里拉，一晚 |
| 6 | fio_e11 首航照片边上的手；fio_e12 不用解释的那把椅子；fio_e18 把住址写在正面 | fio_d06 灯塔下，不等一个答案，3里拉，半天 |

CG：yellow-quilt绑定fio_d01；dinner-fio绑定fio_d02；first-flight绑定fio_e11。无不存在的CG占位。菲尔lines使用work/date两种outfit，neutral/smile/serious/sad/surprise/tired六种表情。

需要引擎履约的约定：fio_e02第二选项产生fio_log，第6天上午九点前交记录；若引擎支持通用约定窗口，应给交记录与改约选项。不应只凭承诺自动当作记录已交。

## 整合修订

晚餐fio_d02在老客户越过菲尔直接向波鲁克发问时立即给出玩家选择；三个选择均next到day0续场fio_d02_after。菲尔真正想做什么，由她在玩家已行动、客人离开之后自己说。文件共25个Scene对象，其中24个可调度场景（18事件、6约会）与1个直接连接的续场，不把续场虚报为新增独立剧情事件。

fio_e03只在此前没有fioLogsDelivered时允许“只管炖豆子”产生fioMissedLogTwice；已按时交过记录的人选择轮休不会被误记两次失信。
