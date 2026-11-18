# Windows 安装与日常启动

新版提供一个安装入口，自动检测并补装依赖；首次仍需要确认 Windows 权限提示、填写自己的百炼配置、在 Chrome 加载扩展。它不是零交互安装，也不是离线安装包。

本包包含 GESP C++ 1～8 级共 216 道历届编程题整理版（截至 2026 年 9 月场次），附来源和自编练习测试点，不含选择题、判断题或官方隐藏评测数据。代码分析支持按当天同题的“修改后未通过评测”次数及倒计时免密，规则与密码可在“分析设置”修改。

知识点标签可进入专题讲解和专项练习，组合标签可以拆开逐点学习；练习先使用题库候选，暂无匹配时再生成 AI 原创题。当前包要求学习服务版本 12（含知识点语法实验及可选表格修复）。已有安装更新文件后重新加载扩展，再点击“启动／更新后台”。

## 首次安装

1. 完整解压 `CodeArena-Windows-20261112.zip`，例如放到 `C:\CodeArena`，不要在压缩包内直接运行。
2. 双击根目录 `一键安装.bat` 或 `install-all.bat`。不要使用旧目录外层遗留的安装脚本。
3. 程序检查 Windows、文件和已有依赖；所有缺失应用的安装包先下载并校验，再依次安装。按 Windows 提示允许安装；取消、下载失败、校验失败或实际运行检查失败都会停止，不继续注册或启动服务。
4. 首次填写模型、兼容接口地址、API Key。已有本机配置会直接复用；Key 输入隐藏，保存在 `gesp-lab-extension\learning_service\.env`。请使用自己账号有权限的模型和地址。
5. 在 Chrome 打开 `chrome://extensions`，开启“开发者模式”，点击“加载已解压的扩展程序”，选择包里的 `gesp-lab-extension` 文件夹。
6. 安装器自动识别当前目录对应的扩展 ID；如需指定其他 CodeArena 安装实例，可向 `install-all.ps1` 传入 `-ExtensionId`。
7. 安装器注册本地组件，验证 C++ 编译运行，启动学习服务。看到 `Ready` 和 `Installation complete` 后打开 CodeArena。若扩展页面已打开，请先重新加载扩展。

## 以后每次使用

打开 Chrome 的 CodeArena 扩展，点击右上角 **“启动／更新后台”**。电脑重启后同样这样操作，不必再双击 BAT；目前不设置开机自启动。启动过程在页面显示进度，失败会显示原因。

旧版已经安装的电脑，只需双击一次 `gesp-lab-extension\enable-page-start.bat` 更新组件注册，看到 `Ready` 后重新打开扩展。首次安装新版完整包已经包含这一步，无需单独执行。

`start-learning.bat` 仅启动服务；`restart-learning.bat` 会重新加载服务代码；两个脚本作为兼容入口保留。网页按钮和一键安装器均已调用同一套启动逻辑。

启动按钮必须在 Chrome 扩展内使用。直接打开 localhost 网页不具备 Chrome 本地组件权限，且服务停止时该网页本身无法打开。

## 检测和补装内容

| 项目 | 处理方式 |
| --- | --- |
| Windows | Intel/AMD 64 位 Windows 10 1809+ 或 Windows 11；不支持本包在 32 位或 ARM64 系统安装 |
| PowerShell | 使用系统 Windows PowerShell 5.1+ |
| Chrome | 检测已有安装；缺失时下载 Google 官方 64 位 MSI，校验签名及发布者 |
| Python | 实际执行检查版本 ≥3.10；缺失时安装官方 Python 3.14.10，校验 SHA-256；商店占位快捷方式不算已安装 |
| C++ 编译器 | 检查 g++ 并实际编译运行 C++17；缺失时安装带 TDM-GCC 的 Dev-C++ 6.3；不使用 No_Compiler 安装包 |
| 调试器 | 检测 GDB，并通过打包后的组件实际启动调试及 Python 变量读取；缺失或不可用时停止安装，修复带 GDB 的 Dev-C++ 后重试 |
| Python 依赖 | 创建项目 `.venv` 并安装 pypdf；本地评测由 `native-host/start-host.bat` 启动 Python 源码，不依赖打包 EXE 或 PyInstaller |
| 题库和页面文件 | 检查必需文件以及索引所引用的题目 JSON，缺失则先停止 |
| 百炼服务 | 检查本机配置及地址连通性；不带密钥的探测可能收到 401，这只说明地址可达；权限、额度和实际模型响应由生成任务验证 |
| 本地组件 | 注册到当前 Windows 用户；验证消息协议、实际 C++ 执行和 GDB 调试。当前 nativeVersion 为 3 |
| 学习服务 | 检查版本、配置、进程及安装目录，成功后才报告就绪 |

不依赖 winget、Node.js、npm 或数据库。新机器无需有 explanation 项目。需要能访问 Python、Google、GitHub、PyPI 和自己的百炼端点；网络受限、系统策略或权限不足时会停止。软件要求 Windows 重启时，按提示重启后重新运行安装入口。

## 错误排查

重复执行安装会复用已通过检测的依赖。后台占用端口时，先验证 CodeArena 的安装目录、PID 与启动命令，再停止旧后台并启动当前版本；PID 文件缺失或损坏会依据正在运行的服务补回。若端口属于其他程序或无法确认身份，则保留该进程并选择空闲端口。就绪地址写入 `.local/service-endpoint.json`，扩展通过本地组件自动读取，安装器也使用该地址验收。

迁移目录后，一键安装依据当前目录计算 Chrome 未打包扩展 ID，并保留本项目旧目录的已注册 ID。注册完成后，在 `chrome://extensions` 重新加载 CodeArena，再关闭并重新打开旧标签页。C++ 本地评测走 Native Messaging，和讲解后台的 HTTP 端口独立。

- **本地组件仍是旧版**：已有安装执行一次 `enable-page-start.bat`，随后重新打开扩展。未执行注册时，仅刷新网页不会更新本地组件。
- **安装依赖失败**：修复窗口中显示的具体缺项，重新运行一键安装；已可用的依赖会复用。
- **后台启动失败**：页面显示错误；详细信息在 `.local\restart-error.log` 和 `.local\service-start\`。
- **组件注册失败**：查看 `.local\page-start-registration.json`，确认在使用 Chrome 的同一个 Windows 用户下运行注册脚本。
- **网络错误 10013**：当前进程被 Windows 拒绝联网。应在正常 Windows 用户会话运行，检查安全软件对该 Python 的限制。
- **问答失败**：先确保服务显示已连接且不是旧版，再点“重试回答”；若是模型鉴权、额度或模型名称错误，按错误信息修正本机配置。

只检测、不安装或重启：

```powershell
cd C:\CodeArena\gesp-lab-extension
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-all.ps1 -CheckOnly -SkipNetwork
```

去掉 `-SkipNetwork` 可包含模型地址连通性检查。结果保存在 `.local\install-check.json`。

## 发布与验证范围

发布包只含运行文件、题库、公开配置模板和打包后的本地程序；不包含个人 API Key、已有课件、聊天、项目虚拟环境或本机组件注册路径。自己的课件位于 `.local\lessons`，聊天位于浏览器 IndexedDB。

已在当前 Windows 电脑验证实际 EXE 消息协议、C++ 编译运行、EXE → PowerShell 启动链及失败回传；已测试依赖检测、缺失补装调度与失败停止。**尚未在全新 Windows 10/11 虚拟机完成完整下载、安装和 Chrome 首次注册验收**，不能保证所有干净机器环境都一次成功。

维护者打包：`python scripts/package-windows.py`。包附文件 SHA-256 清单及整个 ZIP 的 SHA-256 文件。

安装来源：[Python 3.14.10](https://www.python.org/downloads/release/python-31410/)、[Chrome Enterprise 下载](https://chromeenterprise.google/download/)、[Dev-C++ 官方发布](https://github.com/Embarcadero/Dev-Cpp/releases/tag/v6.3)、[Chrome 加载扩展说明](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)。固定地址和校验值在 `scripts/windows-installers.json`。

Python 安装规则：检测版本、64 位架构和 ssl/sqlite3/venv/ensurepip；兼容可用则跳过。否则校验并解压整合包 `python/python-3.14.10-win-x64.nupkg` 到本项目 `.local`，不调用系统 Python EXE/MSI，不卸载系统版本。不可用的项目 `.venv` 会先备份再重建。日志在 `.local/python-runtime.log`。
