Embarcadero Dev-C++ 6.3 完整离线安装包

本目录文件为官方 v6.3 发布的 TDM-GCC 9.2 完整版安装包，未经修改。
不是 No Compiler（无编译器）版本。

使用方法：
1. 双击整包根目录的 install-devcpp.cmd。
2. 安装类型选择 Full / 完整安装，保留 TDM-GCC 编译器组件。
3. 安装后可通过桌面或开始菜单启动 Dev-C++。
4. 双击根目录的 check-cpp.cmd 检查 gcc、g++、GDB、Make，
   并在目标 Windows 上实际编译和运行最小 C / C++ 示例。
5. 若安装到自定义目录，可设置 DEVCPP_HOME 为 Dev-Cpp 安装目录后再检查。

官方说明列出的标准组件包括 Dev-C++ IDE、TDM-GCC 9.2.0（32/64 位）、
GDB 调试、Make 项目构建、AStyle 格式化、模板、语言文件等。
编译器目录为 TDM-GCC-64；标准头文件和库由完整工具链提供。
本包不额外附加第三方 DevPak 插件或其他项目未指定的 C++ 库。

来源与许可：
发布页：https://github.com/Embarcadero/Dev-Cpp/releases/tag/v6.3
产品说明：https://www.embarcadero.com/free-tools/dev-cpp
对应源码：https://github.com/Embarcadero/Dev-Cpp/tree/v6.3
官方安装组件清单：devcpptdmgcc64.nsi，位于对应源码根目录。
许可保留于原安装程序，安装时可查看。

核验说明：下载文件大小已与 GitHub 官方发布资产一致，PE 文件头已检查。
downloads.json 记录本地 SHA-256；官方资产没有提供 SHA-256 digest。
当前打包机是 macOS，未在此执行 Windows 安装和编译；可在目标电脑运行上述检查。
