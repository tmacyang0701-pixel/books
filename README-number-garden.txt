数间 · Windows x64 可选应用安装说明

当前整合包默认入口为 GESP。本文件仅说明保留的数间组件；总说明见 README.txt。

开始使用
1. 把 ZIP 完整解压到准备长期使用的可写文件夹，不要直接在压缩包中运行。
2. 双击「安装数间.cmd」（同 install-number-garden.cmd），自动打开检测与安装进度窗口。
3. 自动检测已有环境，满足要求则复用，缺失或不可用则使用包内文件补装。
4. 如果需要安装 Dev-C++，Windows 可能弹出管理员授权；允许后自动继续完整安装。
5. 全部检查通过后，点击「打开应用」，或使用自动创建的桌面「数间」快捷方式。

检测哪些内容
Node.js：检查实际执行与版本，要求 22 或更新版本。
Python：检查实际执行与版本，要求 3.11 或更新版本，同时能导入 pip、ssl、sqlite3。
Dev-C++：从历史选择、DEVCPP_HOME、注册表和常用安装目录查找 IDE。
C/C++ 组件：在同一 IDE 的工具链目录检查 GCC 9+、G++ 9+、GDB、mingw32-make。
工具链齐全后还会实际编译并执行 C11 和 C++17 示例，检查标准头文件、链接和运行。
已有编译器文件但标准库损坏时，会补装完整工具链。
Windows Store 的 Python 占位程序不当作已安装环境，也不会触发商店下载。

安装和进度
进度窗口显示当前阶段、已完成步骤、当前步骤耗时、组件版本及日志。
总进度按 8 个实际阶段显示；第三方静默安装器未提供内部百分比，因此显示阶段与耗时。
所有安装文件都已放在包内，准备环境不需要联网下载。
Node 缺失时：校验并解压到 runtime/node-v22.23.5-win-x64。
Python 不满足要求时：使用完整离线安装器，目标 runtime/python-full，包含 pip。
Dev-C++/组件不完整时：安装完整 Dev-C++ 6.3 + TDM-GCC 9.2 到 runtime/Dev-Cpp。
不会主动卸载已有旧版本，不修改全局 PATH；旧 Dev-C++ 用户配置会先备份后恢复。
官方安装器可能更新自身的系统安装登记；原程序目录保留。
已有 application/.env 会保留，未配置时只从空白示例创建。
完成后创建桌面「数间」「数间 - Dev-C++」「数间 - Python」快捷方式。
请保持解压目录的位置不变；移动后重新运行安装入口来更新运行环境及快捷方式。

复查、重试和停止
检测：detect-number-garden.cmd，只检测，不启动 Python 或 Dev-C++ 安装器。
注意：检测界面使用 Node 运行逻辑；缺少 Node 时，会先解压包内便携 Node 作为检测工具。
「重新检测并补齐」：重新检测，跳过已经准备好的环境，仅补齐剩余部分。
「当前步骤后停止」：等当前安装器返回后停止，保留已经准备好的组件。
安装报告：installation-report.json；运行路径：runtime-selection.json；日志：setup.log。
组件版本与实际路径也保存在报告里。失败后可查看报告并重试。
check-cpp.cmd：单独检查本次选定工具链的版本及 C/C++ 编译运行。

应用和开发
start-dev.cmd / dev.cmd：使用选定的 Node 构建并启动数间，打开 http://127.0.0.1:4173。
保持启动窗口打开；按 Ctrl+C 停止服务。4173 端口占用时请先关闭之前启动的实例。
build.cmd：构建并校验应用产物。
test.cmd：运行应用测试。
python.cmd：使用选定的 Python，例如 python.cmd --version 或 python.cmd your-script.py。
不需要 npm install，当前应用没有第三方 npm 依赖。官方 Node 便携包自带 npm/npx。
独立的 prepare-*.cmd、install-python.cmd、install-devcpp.cmd 保留用于手动处理；
正常使用只需一键安装入口。

在线模型功能
双击 configure.cmd，填写自己的 ALIBABA_BAILIAN_API_KEY，保存后重启应用。
未配置密钥时仍可使用数字训练；AI 出题、编程讲解和录音评分需要密钥与联网。
本包不包含实际 API 密钥、原机器 .env 或 Git 凭据。

包内内容与适用范围
Windows x64：Node 22.23.5、Python 3.14.10（完整安装器与备用嵌入版）、
Dev-C++ 6.3 完整安装器（TDM-GCC 9.2、GCC/G++、GDB、Make 和标准库）、数间完整源码。
GESP 编程插件已另行整合至 gesp-lab-extension 目录，使用根目录的一键安装入口；详见 README.txt。
安装程序不适用于 macOS。建议使用支持官方组件的 Windows 10/11 x64。
Node/Python 已按官方 SHA-256 校验；Dev-C++ 已核对官方资产大小并记录本地 SHA-256，
其官方发布资产未提供摘要。SHA256SUMS.txt 列出包内每个文件的摘要。
已通过 22 项安装流程模拟测试、25 项应用测试、构建检查和 PowerShell 语法检查。
尚未在 Windows 实机执行第三方安装程序或验证图形安装界面。
许可随官方归档保留；已安装组件的许可文件位于其对应目录。

官方来源
Python：https://www.python.org/downloads/release/python-31410/
Node：https://nodejs.org/download/release/v22.23.5/SHASUMS256.txt
Dev-C++：https://github.com/Embarcadero/Dev-Cpp/releases/tag/v6.3
