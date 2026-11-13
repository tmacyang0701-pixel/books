GESP / CodeArena · Windows 一键安装整合包

当前目录默认安装 GESP 编程插件；原来的“数间”作为可选应用保留。
适用 Windows 10 1809+ / Windows 11，Intel/AMD 64 位电脑。

首次使用
1. 保持整个目录完整，双击“一键安装.bat”或“一键安装.cmd”。两个入口相同。
2. 安装器检测并复用已有 Chrome、Python、C++ 编译器和 GDB；仅补齐缺失项。
3. 首次按提示填写自己的百炼模型、接口地址和 API Key。
4. Chrome 打开 chrome://extensions，开启“开发者模式”，点击“加载已解压的扩展程序”。
   选择当前目录下的 extension 文件夹（里面有 manifest.json）。
   不要选整个整合包目录，也不要再选择 Downloads 中的旧副本。
5. 将 CodeArena 卡片上的 32 位扩展 ID 粘贴到安装窗口。
6. 看到 Ready 和 Installation complete 后，重新加载扩展并打开 CodeArena。
   Windows 授权提示仍需确认；Chrome 首次加载和扩展 ID 也需要手动操作。

日常使用
双击“打开GESP.cmd”，或从 Chrome 扩展菜单打开“CodeArena C++ 本地评测”。
点击页面右上角“启动／更新后台”，即可使用学习服务；电脑重启后也是这样。
不要在安装后移动目录；如需移动，须从新位置重新加载 Chrome 扩展并运行安装。

这些组件是否都要
- Chrome：GESP 插件必需。缺失时下载 Google 官方安装包并验证签名。
- Python 3.10+：讲解、课件、问答等本地学习服务必需，已有可用版本直接复用。
- pypdf：读取上传的 PDF；包内提供已核对 PyPI SHA-256 的离线 wheel。
- g++ / GCC：编译和运行 C++17 必需。
- GDB（含 Python 支持）：断点、单步和变量查看必需，安装流程实际检查。
- Dev-C++ IDE：编辑代码本身不依赖它；保留完整安装包用于补齐 GCC/GDB 工具链。
  不使用 No_Compiler 安装包。Make 随完整工具链提供，插件不额外要求安装它。
- 本地评测组件：使用 extension/native-host/start-host.bat 启动项目 Python 环境中的评测源码，连接 Chrome 与 GCC/GDB；不再依赖打包 EXE。
- Node.js / npm：GESP 日常运行和安装均不需要；保留 node 文件夹供数间使用。
- PyInstaller：不需要。安装器直接验证源码启动、消息协议、C++17 编译运行和 GDB 调试。
- 数据库：不需要。

包内文件的用途
extension/：GESP 扩展、216 道编程题、学习服务和本地评测程序。
python/：完整 Python 安装包、备用嵌入版和离线 PDF wheel。
devcpp/：含 GCC 和 GDB 的完整 Dev-C++ 安装包。
node/、application/：原数间应用及其运行资源，GESP 安装不调用它们。
setup/、setup-tests/：安装辅助代码与验证脚本。

下载与离线范围
Python 和 Dev-C++ 优先使用包内安装文件，执行前验证 SHA-256，不重复下载。
PDF 依赖优先使用包内 wheel，安装到 extension/.venv，不修改全局 Python 包。
缺少 Chrome 时仍需联网下载；讲解、问答和 AI 生成需要百炼配置及联网。
因此整个 AI 应用不是完全离线的。安装器会检查模型配置与地址连通性。

检测、报告和重试
遇到 native messaging host not found 或通信失败：双击“修复本地评测.cmd”，按当前扩展 ID 重新注册已验证的源码启动器，然后关闭并重新打开 CodeArena 页。不需要恢复被安全软件隔离的旧 EXE，也不需要关闭防护或添加排除项。
detect-environment.cmd：只检查本地文件、运行环境、PDF 依赖及模型配置，跳过网络。
检测报告：extension/.local/install-check.json。
网络检查报告：extension/.local/network-check.json。
失败后修复提示的缺项，再次双击一键安装；可用组件会继续复用。
原 runtime-selection.json 中可用的 Python / 编译器路径会被识别；旧路径失效则重新检测。

原“数间”的入口
安装数间.cmd / install-number-garden.cmd：原来的数间安装与进度窗口。
打开数间.cmd / start-dev.cmd：启动数间，地址 http://127.0.0.1:4173。
detect-number-garden.cmd：原数间环境检测。
configure.cmd：数间模型配置。数间的其他开发、构建与测试入口保持原用途。
README-number-garden.txt：数间组件说明。

已有旧版用户
本次整合使用 Downloads/cpp-oj-extension/extension 内的新版程序，
不使用外层遗留的旧安装脚本。原下载目录保留。
本目录提供干净的运行文件，不打包旧目录的 API Key、已有课件或浏览器聊天。
从新路径加载扩展可能获得新的扩展 ID；安装时以当前 Chrome 卡片显示的 ID 为准。
如旧目录的学习服务正占用 8766 端口，先关闭旧服务，再从新目录完成安装。

验证范围
已验证：插件前端测试、216 道题库完整性、安装流程模拟、离线 PDF 安装，
以及本地 Python 源码启动器的真实 C++17 编译运行、GDB/Python 调试和消息协议。
详细验证记录见 integration-verification.json。
本次是安装包整合与验证，没有执行首次 Chrome 注册、覆盖现有注册或调用真实模型生成。
尚未在全新 Windows 虚拟机执行整套首次安装。
