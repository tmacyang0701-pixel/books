# Books 学习应用

本仓库整合 CodeArena GESP、物理实验室和数间，以及 Windows 安装、启动和验证脚本。保留原目录结构，便于原有脚本继续使用相对路径。

| 目录 | 内容 | 入口 |
| --- | --- | --- |
| `extension/` | CodeArena GESP：题库、课件、代码评测、调试、AI 练习 | `打开GESP.cmd`；首次使用见 `README-GESP.txt` |
| `physics-lab-extension/` | 物理实验室 Chrome 扩展 | 在 `chrome://extensions` 中加载此目录 |
| `application/` | 数间应用 | `安装数间.cmd`、`打开数间.cmd` |
| `setup/`、`setup-tests/` | 安装和验证工具 | `一键安装.bat`、`detect-environment.cmd` |
| `python/`、`node/`、`devcpp/` | 配套运行时安装包 | 由安装脚本按需使用 |

GESP 的“相似题练习”支持搜索题目、按等级筛选并切换来源，推荐题和变式生成使用所选题目。更新扩展页面后，请使用“启动／更新后台”加载对应服务代码。

物理实验室的全初中课程与小屏幕适配仍在补齐中；迁移保留了已完成版本和新增课程源文件，不将未接入的内容标记为已完成。

本机密钥、服务配置、学习记录、运行缓存与安装状态不纳入 Git。迁移后首次启动需按原安装说明重新配置本机服务；原目录未删除。

## 开发验证

```powershell
cd extension
npm test
python -m unittest tests.test_knowledge
cd ../physics-lab-extension
npm run check
```

远端地址：`https://github.com/tmacyang0701-pixel/books.git`。当前环境无法连接 GitHub，尚未读取远端历史或推送；联网后应先 `git fetch origin` 检查远端分支，再进行合并或推送，请勿强制覆盖已有历史。
