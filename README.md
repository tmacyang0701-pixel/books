# Books 学习应用

本仓库整合 CodeArena GESP、物理实验室和数间，以及 Windows 安装、启动和验证脚本。保留原目录结构，便于原有脚本继续使用相对路径。

| 目录 | 内容 | 入口 |
| --- | --- | --- |
| `gesp-lab-extension/` | CodeArena GESP：题库、课件、代码评测、调试、AI 练习 | `打开GESP.cmd`；首次使用见 `README-GESP.txt` |
| `physics-lab-extension/` | 物理实验室 Chrome 扩展 | 在 `chrome://extensions` 中加载此目录 |
| `application/` | 数间应用 | `安装数间.cmd`、`打开数间.cmd` |
| `setup/`、`setup-tests/` | 安装和验证工具 | `一键安装.bat`、`detect-environment.cmd` |
| `python/`、`node/`、`devcpp/` | 配套运行时安装包 | 由安装脚本按需使用 |

GESP 的“相似题练习”支持搜索题目、按等级筛选并切换来源，推荐题和变式生成使用所选题目。更新扩展页面后，请使用“启动／更新后台”加载对应服务代码。

物理实验室 2.1 包含七个模块、64 节课程及自测、48 个 WebGL 三维实验和 10 个实践项目，支持可收起导航和小屏幕布局。加载 `books/physics-lab-extension`，不要选择其外层保留的旧版目录。具体范围与验证见 [物理实验室说明](physics-lab-extension/docs/V2-COVERAGE.md)。

本机密钥、服务配置、学习记录、运行缓存与安装状态不纳入 Git。本地迁移保留了原有课件、练习、任务记录与学习服务配置，均位于 Git 忽略路径；原目录未删除。新路径首次使用本地 C++ 评测时，需要按安装说明更新 Native Host 注册及扩展 ID；Chrome 内保存的聊天、编辑器和进度数据属于原扩展安装实例，不随源码迁移。

GESP 目录现为 `gesp-lab-extension`。Chrome 需选择此目录加载已解压的扩展，再运行根目录 `修复本地评测.cmd` 更新本地组件注册。需要释放后台占用时，双击 `停止CodeArena后台.bat`；脚本核对安装路径和进程身份，兼容改名前的后台与自选端口。课件、练习与服务配置随目录保留。

迁入已有的空 Git 仓库 `D:\books-angent`：关闭正在生成内容的页面、暂停编辑后，在当前目录双击 `迁移到D盘.bat`。脚本先核对两端仓库和远程地址，停止当前安装的后台，复制全部文件（含本机配置、课件和被 Git 忽略的数据），逐文件校验 SHA-256，并从本地导入当前分支的提交历史。保留目标 `.git` 配置和旧目录备份，不连接或推送远程；目标已有文件或提交时会停止，避免覆盖。复制完成后，归档失效的旧 PID/服务地址记录，验证 C++ 并将本地组件注册到新路径。之后在 Chrome 加载 D 盘下的两个扩展目录，并将编码工作区切换到 `D:\books-angent`。迁移校验记录保存在目标 `.git/books-migration-report.json`；若提示文件已复制但注册失败，应在目标运行 `一键安装.bat` 修复，不要重复迁移。

## 开发验证

```powershell
cd gesp-lab-extension
npm test
python -m unittest tests.test_knowledge
cd ../physics-lab-extension
npm run check
```

远端地址：`https://github.com/tmacyang0701-pixel/books.git`。当前环境无法连接 GitHub，尚未读取远端历史或推送；联网后应先 `git fetch origin` 检查远端分支，再进行合并或推送，请勿强制覆盖已有历史。
