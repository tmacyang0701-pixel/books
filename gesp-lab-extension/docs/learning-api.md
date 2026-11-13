# 本地学习接口

绑定 `127.0.0.1:8766`，仅本机使用。所有写请求为 `application/json`。千问密钥由服务端从 `explanation/.env` 读取，浏览器不接收密钥。默认讲解模型 `qwen3.8-max`，图片识别 `qwen3-vl-plus`。保留 explanation 项目原配置。

可在 `learning_service/.env` 使用 `ALIBABA_BAILIAN_API_KEY`、`ALIBABA_BAILIAN_MODEL` 和 `ALIBABA_BAILIAN_OPENAI_COMPATIBLE` 覆盖参考项目配置；系统环境变量优先。本机已切换到用户提供的专属接口与 `qwen3.7-plus`。`/api/health` 的 configured 仅表示已读取密钥，不代表已通过真实模型调用。

| 接口 | 请求 | 响应 |
| --- | --- | --- |
| GET /api/health | 无 | 服务版本、模型、configured，不含凭证 |
| POST /api/lessons | `{problem,targetLevel,requirements}` | 202 `{id,status}`，启动讲解任务 |
| POST /api/imports | `{filename,contentBase64,level}` | 202 任务；支持 JSON/TXT/MD/PDF/JPEG/PNG/WebP |
| POST /api/practice | `{lessonId}` | 202 任务；生成 3 道原创变式 |
| POST /api/knowledge-practice | `{topic,targetLevel}` | 202 `topic-practice` 任务；只有题库暂无匹配单点练习时才允许生成 |
| POST /api/run-cases | `{lessonId,pageIndex,currentInput}` | 202 任务；完成结果 `{lessonId,pageIndex,input,expected,explanation}`，以服务保存的原题约束生成用例 |
| POST /api/chat | `{lessonId,pageIndex,messages:[{role,content,attachments?:[{name,dataUrl}]}],visualContext?}` | 202 问答任务；pageIndex 从 0 开始，完成结果为 `{lessonId,pageIndex,answer,model}` |
| GET /api/jobs/{id} | 无 | `{id,kind,status,message,result?,error?}` |
| GET /api/lessons | 无 | 课件摘要列表，持久化到 `.local/lessons` |
| GET /api/lessons/{id} | 无 | 完整课件、题目、等级、相似题 ID |
| DELETE /api/lessons/{id} | 无 | `{deleted:true,lessonId,problemId}`；删除当前课件，不删除原题 |
| GET /api/practice | 无 | 已生成变式列表 |

任务状态：queued → running → completed / failed。模型仅对瞬时网络问题、408、429、5xx 有限重试；401/403/400 不重复调用。流式响应须以 `finish_reason=stop` 结束且通过结构校验才能保存；失败不覆盖已有课件。重启时未完成任务转 failed，前端保留错误并允许重试。

版本 10 增加 `knowledgeTopics` 能力。知识点课件通过现有 `/api/lessons` 生成，problem.kind 为 `knowledge-topic`，关联 ID 为 `knowledge-{level}-{encodeURIComponent(topic)}`。生成提示明确要求 2～3 个小用例和适用的步骤动画，不冒充原题。组合标签及同义标签在 `data/gesp/knowledge.json`；前后端共同使用这份映射筛选单点练习。

版本 11 起，知识点课件使用独立生成器，保存 `lessonType:knowledge`、`topicSchema:2`、`teachingLevel`，6～12 页只能使用原理、语法、示例、动手实践、易错、总结六种类型，最后为总结。语法页必须有 `syntax:{code,notes}` 和 `lab:{title,task,starterCode,input,expectedOutput,hint}`；动手实践页必须有 lab。starterCode 需包含 main，input/hint 可空。知识点必须是单标签，problem.level 必须等于 targetLevel。请求传入本级范围、前序基础和排除的后序等级；语义是否符合大纲仍依赖模型，结构校验不代表教学准确性已独立验证。

版本 12 修复可选 trace 表格阻断课件：null、空对象、字段无效或列数不匹配的表格统一为空表；无完整参考代码时接受 null 并转为空字符串。缺少语法或实验必填内容仍拒绝保存。客户端语法实验直接调用既有本地 run 协议，当前编辑代码、输入与实际结果可以作为本页问答上下文；草稿按课件 ID 和页码隔离。导出 HTML 显示静态实验框架，不带运行按钮，也不绕过参考代码显示锁。

`/api/knowledge-practice` 限 topic 为 1～100 字的单个知识点、targetLevel 为 1～8 整数。题库中已有符合知识点与基础标签的候选时返回 400 `bank_available`，不会调用模型。生成结果恰好 3 题，每题完整约束、样例及 2～5 个测试点，分值总和 100；混入其他知识点标签或样例与测试点不一致则拒绝保存。完成结果为 `{id,topic,targetLevel,createdAt,problems}`，每题带 `knowledgeTopic`，通过原有 `GET /api/practice` 恢复。题面语义和正确输出尚无独立标准解验证。

连接错误区分 `network_permission`（如 Windows 10013）、`tls_certificate`、`dns` 和 `connection`。权限拒绝与证书错误不重试，不输出凭证或原始请求。`learning_service.doctor` 在启动后台服务前用不带 Authorization 的 `/models` 请求检查当前进程网络；权限失败时启动脚本退出，不留下无法联网却显示 Ready 的后台进程。

上传最多 8 MiB；JSON/TXT/MD 在本地解析；文本 PDF 用 pypdf 提取后交模型整理；图片由视觉模型识别。图片/PDF 识别结果需在上传表单中确认再生成课件。模型生成测试点不冒充官方数据，不声称已经独立验证。

错误结构：`{error:{code,message}}`。未知资源 404，非法字段/类型 400，Origin/Host 不允许 403，请求过大 413，任务繁忙 429。浏览器只能读取公开前端资源及这些 API，不能请求 `.env`、`.local`、Python 文件或配置文件。

本页问答：服务从已保存课件中提取指定页面、原题和目标等级，客户端不能覆盖页面上下文。messages 仅允许 user/assistant，最多 20 条、合计 24000 字，单条最多 8000 字，最后一条必须是非空用户提问且不超过 4000 字。聊天任务共用有限队列，但只保存在服务内存；浏览器以课件 ID 与页码为键，将历史、草稿和待完成任务 ID 保存到 IndexedDB。刷新可继续轮询；服务重启后的未完成问答可以重试。每次请求只携带该页最近的有限历史，切页时的迟到回答仍归原页。

服务版本 12（runCaseSchema=2）提供 `topicSyntaxLabs`、`knowledgeTopics`、`pageChat`、`socraticPageChat`、`imagePageChat`、`runCases`、`codeAnalysis`、`uniqueLessons`、`deleteLesson` 能力。健康响应也含 `processId`、`instancePath`，用于启动器核实实际服务进程及目录。课件摘要包含 `problemId`；同题只保留一份当前课件。优先以题目 ID 关联，没有 ID 时对题干、输入输出、约束、等级生成稳定摘要。重新生成先完成并校验新内容，再将旧版本移入 `.local/lesson-archive/`；生成失败不替换。启动时同题历史版本自动归档，只保留最新。同题重复生成返回 429 `busy`，生成期间删除返回 409 `busy`。删除同样归档课件，浏览器负责移除该课件的 IndexedDB 问答记录；按原题保存的解锁历史独立保留。

换用例任务为 `run-case`：必须指定存在且带代码的页，currentInput 不超过 20000 字；服务只使用已保存原题，不接受客户端替换题干。输出 input/expected/explanation 分别最多 20000/4000/1000 字；模型用例生成使用独立系统提示。兼容单例封装与常见等价字段名；输入和预期输出必须是非空文本，说明可省略，过长说明裁剪到 1000 字。格式不合格或输入重复时自动修正一次，仍无效才失败；不会使用编造的输入替换失败结果。AI 预期输出标记为供核对，不是独立验证后的评测答案。

本地调试使用 `chrome.runtime.connectNative` 持续连接；nativeVersion 3 的 `cppDebugger` 与 `debuggerAvailable` 声明能力。`debug_start` 接收 code/input/breakpoints；后续请求携带 sessionId：`debug_step` 的 action 仅 next/step/finish/continue，`debug_breakpoints` 接收 lines，`debug_snapshot` 接收 frame/offset，`debug_children` 接收 variableId/offset，`debug_memory` 接收 variableId，`debug_stop` 结束。没有任意 GDB 命令或表达式入口。变量按当前调用帧与源文件作用域枚举，每批 80 项，内存仅读取已枚举对象的前 64 字节；不是枚举整个进程内存。程序使用原始代码以 `-O0 -g3` 编译，调试 I/O 重定向在独立翻译单元实现以保留源码行号。关闭连接或超时清理该会话的进程和临时文件。

仅 user 消息可带 `attachments`；一次请求（含历史）合计最多 3 张，每张解码后不超过 2 MiB。`dataUrl` 必须为 PNG/JPEG/WebP 的 Base64 数据 URI，并通过编码及文件头校验，拒绝远程 URL、SVG 和助手图片。附件单独转换为模型的 `image_url` 内容块，文本历史只携带 `imageNumbers` 对照，不重复嵌入 Base64。带图走配置的 `visionModel`，结果的 model 返回实际使用模型；纯文本沿用文字模型。服务不落盘聊天图片，浏览器 IndexedDB 保存本页历史和草稿。缺少 `imagePageChat` 能力的后台不能接收图片问答。

可选 `pages[].useOriginalSample` 是布尔值，只有实际引用原题样例的页面为 true；未提供时前端根据页种类和内容判断。`pages[].examples` 最多 3 条，每条含 title/input/output（各 1～4000 字）、explanation（最多 2000 字）、可选 visual。无效可选示例丢弃，不影响有效正文；visual 使用同一结构校验。当前选中的补充示例和动画帧会加入 `visualContext`，继续遵守 6000 字上限。

页面支持 `visual` 数据（flow / array / grid，包含 nodes、edges、frames），后端限制节点、连线、帧数与文本长度，前端绘制固定样式 SVG，不执行模型提供的代码。无效 visual 被忽略，仍保留有效文字课件。可选字符串 `pseudocode`、`pseudocodeExample` 分别提供中文伪代码和小样例，显示在 C++ 代码之前。已有哥德巴赫课件在前端补充确定的图解和伪代码。

问答请求的可选 `visualContext` 最多 6000 字，用于补充用户当前看到的动画帧和旧课件补充的伪代码；它作为不可信参考内容，不能覆盖服务器读取的课件正文。问答任务不写服务磁盘。默认采用苏格拉底式引导，每轮推进一个小步骤；明确要求直接解释时直接回应。可选 `pages[].questions` 保存最多 3 个长度为 4～80 字的不同问题，无效项移除，旧课件由前端按页补充建议。

首次通过 `install-all.bat` 安装；日常从已注册的 Chrome 扩展页面启动／更新后台。本地组件支持 `capabilities`、`learning_service_start`（可选布尔 `restart`）、`learning_service_status`（32 位十六进制 `jobId`），只执行已登记目录下的固定启动脚本，不接受页面传入的命令或路径。任务记录位于 `.local/service-start`；启动检查失败会返回原因，不报告 Ready。联网检测只证明端点可达，不证明模型权限、额度或实际生成成功。

参考协议：https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions 。讲解顺序、分离上屏正文与讲稿、JSON 结构校验及断流不发布的设计参考本机 `explanation/app/providers.py`，未复用其数据库、部署和租户模块。

## 代码分析与教学设置

- `GET /api/analysis-settings` 返回 `{scope:"day",dailyMinutes,failedChanges}`，不含密码摘要。
- `POST /api/analysis-access` 用 `{password}` 验证当前分析密码；通过后返回公开规则。
- `POST /api/analysis-settings` 接收 `{currentPassword,dailyMinutes,failedChanges,newPassword?}`。时间范围 1～720 分钟、次数 1～100；新密码留空不变，否则长度 6～128。必须验证当前密码才保存，保存文件为 `.local/analysis-settings.json`，修改密码后使用随机盐和 PBKDF2-SHA256（180000 次）。
- `POST /api/code-analysis` 接收 `{problem,code,input,gate}`，返回 202 任务。`gate` 使用 `{password}` 或 `{attempts:[{hash,status,at,mode:"judge"}]}`。每条免密记录必须属于本机当天、是不同代码摘要的未通过评测记录；普通运行及无法辨别来源的旧记录不计入。距最早有效修改后未通过评测记录达到设置分钟数，且前端最新评测仍未通过时提供免密入口。记录来自浏览器，属于教学门槛，不能防止本机使用者篡改。
- 代码最多 50000 字、2000 行；标准输入最多 20000 字。凭证仅用于本地授权，不写入任务、日志或发给模型。完成结果为 `{problemId,sourceHash,model,summary,issues:[{line,endLine,severity,title,reason,suggestion}]}`，行号从 1 开始，最多 30 条；severity 为 error/warning/suggestion。前端验证代码 SHA-256 与题目 ID 后才展示和保存成功历史。

版本 9 修正旧版“首末失败间隔”的计时：即使设置为 1 次失败，也可在时间到达后免密，不需要再提交一次。倒计时到零不自动生成分析，仍需用户点击。浏览器 IndexedDB `codearena-code-analysis` 分别保存有效尝试与成功分析历史；旧版未成功点击记录自动移除。

## 物理实验室共用接口

所有物理接口与原 GESP 接口由同一 Application、HTTP 服务、模型配置和有限任务池提供。全局健康检查新增 `physicsTutoring` 能力，兼容原服务版本 12。

- `GET /api/physics/health`：返回服务名、`physicsSchema:1`、是否配置模型、模型名称，不返回密钥。
- `POST /api/physics/lessons`：`{question,requirements?}`，返回 202 任务。question 包含原题 ID、年份、题号、完整题干、小问及参考答案、原解析、章节和知识点。补充要求最多 2000 字。
- `GET /api/physics/jobs/<任务ID>`：只读取 kind 为 physics 的任务；共用原队列，物理同题并发生成返回 429。
- `GET /api/physics/lessons`：仅列出物理课件摘要。
- `GET /api/physics/lessons/<sh-年份-题号>`：读取该原题当前课件与三道变式，不接受文件路径。
- `GET /physics/`：提供同级物理扩展的静态页面，只允许前端入口、样式、src 和 icons；不开放脚本、配置或私有数据目录。

课件与三道变式作为一个 schema=1 文档保存，未完成或校验失败不发布。pages 需要 6～12 页、六种物理教学环节；variants 恰好三题，章节与知识点限于原题，小问支持 choice / number / text。number 必须提供 calculation，以受限 AST 数值运算核对答案，不执行模型代码。结构或验算失败最多修正一次，仍失败则任务失败。物理语义、量纲与实验条件仍需教学核对。

物理扩展的来源 ID 根据同级目录路径或 manifest.key 计算，与现有 Chromium 注册算法一致；该额外来源仅访问 `/api/physics/`。原有 GESP 来源规则不变。物理任务、课件和浏览器缓存均不包含模型凭证。

章节问答同样共用物理命名空间：`POST /api/physics/questions` 接收 `{chapter}`，首次返回推荐问题生成任务，已缓存且正文指纹一致时直接返回 `{chapterId,questions}`。三个问题由模型生成并检查长度与去重，保存于 `.local/physics-questions/`。`POST /api/physics/chat` 接收 `{chapter,messages}`，messages 限 user/assistant、最多 20 条、合计最多 20000 字、最后为用户问题；完成结果为 `{chapterId,answer,model}`。两种任务均通过 `/api/physics/jobs/<id>` 查询；聊天任务仅在后台内存保存，正文与对话历史不落后台任务盘。前端按章节保存对话、草稿和任务关联。健康检查中的 `chapterChat:true` 标记能力。

物理章节问答支持 `messages[].attachments: [{name, dataUrl}]`，图片格式和大小复用 GESP 校验（每次最多三张 PNG/JPEG/WebP、每张 2 MiB）。图片用 `imageNumbers` 与消息关联，实际图像交给已配置的视觉模型，问答任务不落盘。`GET /api/physics/health` 的 `chapterImages: true` 表示已启用图片问答。
