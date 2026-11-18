#!/usr/bin/env python3
"""Export account-visible Xiaohou contest problems using normal student GET APIs.

Credentials are read from a separate file, never written into the export. No
registration, start-exam, submission, grading, or administrative API is called.
Raw response caches must remain outside the distributable output directory.
"""
import argparse
import base64
import concurrent.futures
import csv
import datetime as dt
import gzip
import hashlib
import html
import json
import re
import shutil
import time
import textwrap
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from html.parser import HTMLParser

BASE = "https://rest.xiaohoucode.com/api/competition"
NON_QUESTION_PAGES = {"立即报名", "比赛说明", "课程体系图"}


def contest_period(name):
    match = re.search(r"(\d{4})年(春|秋)第0*(\d+)周", name)
    if not match:
        return {"year": None, "season": "", "week": None, "periodLabel": name}
    year, season, week = int(match[1]), {"春": "春季", "秋": "秋季"}[match[2]], int(match[3])
    return {"year": year, "season": season, "week": week,
            "periodLabel": f"{year}年{season}第{week}周"}


def problem_key(project_id, category):
    return str(project_id) if category in (4, 9) else f"{category}-{project_id}"


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


class Client:
    def __init__(self, token_file, cache):
        self.token = token_file.read_text().strip()
        # Partition cached responses by credential without storing the credential.
        self.cache = cache / hashlib.sha256(self.token.encode()).hexdigest()[:16]
        self.cache.mkdir(parents=True, exist_ok=True)

    def get(self, path, params=None):
        assert path.startswith(("/portal/serial/list", "/user/public/getCompPage",
                                "/user/public/getCompModuleList", "/subject/s-practices?",
                                "/cpp/exercise/")) or path in ("/subject/s-practices", "/paper/question", "/choice/question")
        route = path + ("?" + urllib.parse.urlencode(params) if params else "")
        target = self.cache / (hashlib.sha256(route.encode()).hexdigest() + ".json")
        if target.exists():
            return json.loads(target.read_text())["response"]
        request = urllib.request.Request(BASE + route, headers={
            "authorization": self.token, "origin": "https://jingsai.xiaohoucode.com",
            "referer": "https://jingsai.xiaohoucode.com/", "accept": "application/json",
            "User-Agent": "Mozilla/5.0",
        })
        result = None
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=30) as response:
                    raw = response.read()
                if raw[:2] == b"\x1f\x8b":
                    raw = gzip.decompress(raw)
                result = json.loads(raw)
                if result.get("status") in (429, 500, 502, 503, 504) and attempt < 2:
                    time.sleep(1 + attempt)
                    continue
                break
            except urllib.error.HTTPError as error:
                result = {"status": error.code, "message": f"HTTP {error.code}"}
                if error.code not in (429, 500, 502, 503, 504):
                    break
            except (OSError, ValueError) as error:
                result = {"status": 0, "message": type(error).__name__}
            if attempt < 2:
                time.sleep(1 + attempt)
        if result.get("status") == 200:
            dump(target, {"route": route, "response": result})
        return result


def parallel(stage, tasks, worker, jobs):
    results = []
    print(f"{stage}: 0/{len(tasks)}", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as pool:
        futures = {pool.submit(worker, task): task for task in tasks}
        for future in concurrent.futures.as_completed(futures):
            results.append((futures[future], future.result()))
            if len(results) % 10 == 0 or len(results) == len(tasks):
                print(f"{stage}: {len(results)}/{len(tasks)}", flush=True)
    return results


def problem_record(data, references):
    references = [dict(r, **contest_period(r['contestName'])) for r in references]
    sample_data = data.get("sample") or []
    if isinstance(sample_data, str):
        sample_data = json.loads(sample_data)
    if not sample_data:
        # Older platform test problems embed samples in custom statement tags.
        for block in re.findall(r'<xh-example>(.*?)</xh-example>', data.get('descMD', ''), flags=re.S):
            a = re.search(r'<example-input>(.*?)</example-input>', block, re.S)
            b = re.search(r'<example-output>(.*?)</example-output>', block, re.S)
            if a and b:
                sample_data.append({'inputSample': textwrap.dedent(a[1].strip('\n')).strip('\n'),
                                    'outputSample': textwrap.dedent(b[1].strip('\n')).strip('\n')})
    samples = []
    for s in sample_data:
        assert isinstance(s, dict) and "inputSample" in s and "outputSample" in s
        samples.append({"input": s["inputSample"], "output": s["outputSample"]})
    return {
        "id": f"xiaohou-competition-{data['projectId']}",
        "exportKey": str(data['projectId']),
        "platformProjectId": data["projectId"], "title": data["name"],
        "source": "学而思", "kind": "programming", "tags": ["来源：学而思", "题型：C++编程", "评测：仅原题样例"]
            + sorted({"赛事：" + r["contestName"] for r in references})
            + sorted({"组别：" + r["group"] for r in references})
            + sorted({"赛期：" + r["periodLabel"] for r in references})
            + sorted({f"周次：第{r['week']}周" for r in references if r['week'] is not None}),
        "years": sorted({r['year'] for r in references if r['year'] is not None}),
        "seasons": sorted({r['season'] for r in references if r['season']}),
        "weeks": sorted({r['week'] for r in references if r['week'] is not None}),
        "description": data.get("descMD") or data.get("description", ""),
        "input": data.get("inputFormatMd") or data.get("inputFormat", ""),
        "output": data.get("outputFormatMd") or data.get("outputFormat", ""),
        "constraints": data.get("dataRangeMd") or data.get("dataRange", ""),
        "tips": data.get("tipsMd") or data.get("tips", ""),
        "contentHtml": {key: data.get(field, "") for key, field in [
            ("description", "description"), ("input", "inputFormat"),
            ("output", "outputFormat"), ("constraints", "dataRange"), ("tips", "tips")]},
        "timeLimitSeconds": data.get("limitRunTime"),
        "memoryLimitMB": data.get("limitMemory"),
        "samples": samples,
        "cases": [{"input": s["input"], "expected": s["output"],
                   "label": f"原题样例 {i + 1}", "source": "statement_sample"}
                  for i, s in enumerate(samples)],
        "judgeDataStatus": "仅题面公开样例；未取得原始隐藏评测数据",
        "occurrences": references,
    }


def theory_record(data, references):
    ref = references[0]
    project_id = ref['projectId']
    key = problem_key(project_id, ref['category'])
    content = data.get('content') or data.get('title') or data.get('stem') or ''
    title = html.unescape(re.sub('<[^>]+>', '', content)).strip()
    if '<img' in content:
        paragraphs = [html.unescape(re.sub('<[^>]+>', '', v)).strip()
                      for v in re.findall(r'<p[^>]*>(.*?)</p>', content, re.S)]
        paragraphs = [v for v in paragraphs if v]
        if paragraphs:
            title = ('二叉树程序填空：' if '二叉树' in content else '程序阅读：') + paragraphs[-1]
    title = re.sub(r'\s+', ' ', title)[:70] or ref['title']
    record = problem_record({'projectId': project_id, 'name': title, 'description': content}, references)
    record.update(id='xiaohou-competition-' + key, exportKey=key, kind='theory',
                  questionType=data.get('logicQuesTypeName') or data.get('writtenQuesTypeName') or '初赛理论题',
                  questionData=data, answer=data.get('answer', data.get('normalAnswer')),
                  options=data.get('answerOptionList', data.get('optionItems', [])),
                  analysis=data.get('analysis') or data.get('explanation') or '',
                  judgeDataStatus='理论题：保留平台返回的题干、选项及答案字段；不适用编程评测点')
    record['tags'] = [t for t in record['tags'] if not t.startswith(('题型：', '评测：'))]
    record['tags'] += ['题型：' + record['questionType'], '答案：已获取' if record['answer'] else '答案：未返回']
    return record


def text_block(value):
    return '<div class="text">' + html.escape(str(value or "")) + '</div>'


class SafeStatement(HTMLParser):
    """Keep source formatting and MathML without executing source markup."""
    tags = set('p div span br hr strong b em i u s sub sup pre code blockquote ul ol li table thead tbody tr td th img a h1 h2 h3 h4 math semantics annotation mrow mn mo mi msup msub msubsup mfrac msqrt mroot mtext mspace mtable mtr mtd mover munder munderover mfenced mstyle mpadded mphantom menclose'.split())
    voids = {'br', 'hr', 'img'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.blocked = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'iframe', 'object'):
            self.blocked += 1
        if self.blocked or tag not in self.tags:
            return
        safe = []
        for key, value in attrs:
            value = value or ''
            if key in ('class', 'alt', 'title', 'colspan', 'rowspan', 'encoding', 'display', 'mathvariant', 'xmlns'):
                safe.append((key, value))
            elif key == 'style':
                allowed = {'height', 'width', 'vertical-align', 'margin-left', 'margin-right',
                           'margin-top', 'margin-bottom', 'top', 'left', 'padding-left',
                           'font-size', 'border-bottom-width', 'text-indent', 'text-align'}
                styles = []
                for declaration in value.split(';'):
                    if ':' not in declaration:
                        continue
                    prop, val = (v.strip().lower() for v in declaration.split(':', 1))
                    if prop in allowed and re.fullmatch(r'(?:-?(?:\d+(?:\.\d*)?|\.\d+)(?:em|ex|px|rem|%)?|left|right|center|normal)', val):
                        styles.append(prop + ':' + val)
                if styles:
                    safe.append(('style', ';'.join(styles)))
            elif key in ('src', 'href') and (value.startswith(('https://', 'http://', '//', '#', '../../assets/'))):
                safe.append((key, 'https:' + value if value.startswith('//') else value))
        self.parts.append('<' + tag + ''.join(' ' + k + '="' + html.escape(v, quote=True) + '"' for k, v in safe) + '>')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'iframe', 'object'):
            self.blocked = max(0, self.blocked - 1)
            return
        if not self.blocked and tag in self.tags and tag not in self.voids:
            self.parts.append('</' + tag + '>')

    def handle_data(self, data):
        if not self.blocked:
            self.parts.append(html.escape(data))


def statement_html(value):
    parser = SafeStatement()
    parser.feed(value)
    return '<div class="statement">' + ''.join(parser.parts) + '</div>'


STYLE = """body{max-width:1080px;margin:32px auto;padding:0 20px;font:16px/1.8 system-ui,sans-serif;color:#203338}
a{color:#066a75}h1{font-size:28px}h2{margin-top:28px}pre,.text{white-space:pre-wrap;overflow-wrap:anywhere}
pre{padding:16px;background:#f2f5f6}table{border-collapse:collapse;width:100%}td,th{padding:8px;border:1px solid #ddd;text-align:left}
.note{background:#fff4d7;padding:12px}input{width:95%;padding:10px;font:inherit}small{color:#607070}select{padding:8px;margin:8px 8px 8px 0;font:inherit}
.statement img{max-width:100%;height:auto}.statement>.katex{white-space:normal}"""


def page(title, body, script=""):
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + html.escape(title) + '</title><style>' + STYLE + '</style></head><body>' + body + script + '</body></html>'


def export_files(out, contests, problems, errors, page_count, bundle_count, image_cache=None):
    out.mkdir(parents=True, exist_ok=True)
    image_map = {}
    if image_cache:
        manifest = json.loads((image_cache / 'manifest.json').read_text())
        for url, item in manifest.items():
            if item['status'] != 'ok':
                continue
            local = out / 'assets/images' / item['file']
            local.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(image_cache / item['file'], local)
            image_map[url] = 'assets/images/' + item['file']
        dump(out / 'assets/images/manifest.json', manifest)

    def local_html(value):
        for url, target in image_map.items():
            value = value.replace(url, '../../' + target)
        return statement_html(value)
    katex = Path(__file__).resolve().parents[1] / "gesp-lab-extension/vendor/katex"
    if katex.exists():
        shutil.copytree(katex, out / "assets/katex", dirs_exist_ok=True)
    links = {}
    for p in problems:
        pid = p['exportKey']
        folder = out / "problems" / pid
        p['assets'] = [{'sourceUrl': u, 'localPath': path} for u, path in image_map.items()
                       if u in json.dumps(p, ensure_ascii=False)]
        dump(folder / "problem.json", p)
        body = '<p><a href="../../index.html">返回题目目录</a></p><h1>' + html.escape(p["title"]) + '</h1>'
        if p['kind'] == 'programming':
            body += '<p>来源：学而思 · 时间限制：' + html.escape(str(p["timeLimitSeconds"])) + ' 秒 · 内存限制：' + html.escape(str(p["memoryLimitMB"])) + ' MB</p>'
        body += '<p>' + html.escape('；'.join(p["tags"])) + '</p>'
        for label, key in [("题目描述", "description"), ("输入格式", "input"), ("输出格式", "output"), ("数据范围", "constraints"), ("提示", "tips")]:
            if p.get(key):
                content = p.get('contentHtml', {}).get(key)
                body += '<h2>' + label + '</h2>' + (local_html(content) if content else text_block(p[key]))
        for i, s in enumerate(p["samples"], 1):
            (folder / f"sample-{i}.in").write_text(s["input"], encoding="utf-8")
            (folder / f"sample-{i}.out").write_text(s["output"], encoding="utf-8")
            body += f'<h2>样例 {i}</h2><h3>输入</h3><pre>' + html.escape(s["input"]) + '</pre><h3>输出</h3><pre>' + html.escape(s["output"]) + '</pre>'
        if p['kind'] == 'theory':
            def render_options(node):
                if isinstance(node, list):
                    return ''.join(render_options(x) for x in node)
                if isinstance(node, dict):
                    no = str(node.get('aoVal') or node.get('no') or '')
                    return '<p><b>' + html.escape(no) + '</b></p>' + local_html(node.get('content') or node.get('value') or '')
                return text_block(node)
            body += '<h2>选项</h2>' + render_options(p['options'])
            body += '<details><summary>查看接口返回的答案</summary>' + text_block(json.dumps(p['answer'], ensure_ascii=False) if p['answer'] else '未返回') + '</details>'
            if p['analysis']:
                body += '<h2>解析</h2>' + local_html(p['analysis'])
            # Preserve nested reading/completion question structure without losing fields.
            body += '<details><summary>完整题目结构（含子题）</summary><pre>' + html.escape(json.dumps(p['questionData'], ensure_ascii=False, indent=2)) + '</pre></details>'
        else:
            body += '<p class="note">样例不等于完整评测点。本包未取得平台隐藏评测数据。</p>'
        math_script = ''
        if katex.exists():
            math_script = '<link rel="stylesheet" href="../../assets/katex/katex.min.css"><script src="../../assets/katex/katex.min.js"></script><script src="../../assets/katex/auto-render.min.js"></script><script>renderMathInElement(document.body,{delimiters:[{left:"$$",right:"$$",display:true},{left:"$",right:"$",display:false}],throwOnError:false,trust:false})</script>'
        (folder / "index.html").write_text(page(p["title"], body, math_script), encoding="utf-8")
        links[pid] = f"problems/{pid}/index.html"
    success_ids = {p['exportKey'] for p in problems}
    for contest in contests:
        contest.update(contest_period(contest['name']))
        references = contest.get("problemReferences", [])
        contest["exportedProblemCount"] = len({problem_key(r["projectId"], r['category']) for r in references} & success_ids)
        if contest["exportedProblemCount"]:
            contest["exportStatus"] = "已导出可获取题目"
        elif contest.get("errors"):
            contest["exportStatus"] = "读取异常或受限，详见 errors"
        elif contest.get("bundles"):
            contest["exportStatus"] = "有入口但未取得题面，详见题目包状态"
        else:
            contest["exportStatus"] = "当前登录信息下未返回题目入口"
    summary = {
        "exportedAt": dt.datetime.now(dt.timezone.utc).isoformat(), "source": "学而思",
        "contestCount": len(contests), "questionPagesChecked": page_count,
        "bundleCount": bundle_count,
        "contestsWithExportedProblems": sum(bool(c["exportedProblemCount"]) for c in contests),
        "uniqueProblemCount": len(problems),
        "programmingProblemCount": sum(p['kind'] == 'programming' for p in problems),
        "theoryProblemCount": sum(p['kind'] == 'theory' for p in problems),
        "knowledgeTaggedProblemCount": sum(bool(p.get('knowledgePoints')) for p in problems),
        "downloadedImageCount": len(image_map),
        "problemOccurrences": sum(c["exportedProblemCount"] for c in contests),
        "sampleCount": sum(len(p["samples"]) for p in problems),
        "hiddenJudgeDataObtained": False, "errorCount": len(errors),
        "tagPolicy": ["来源：学而思", "赛事：原赛事名", "赛期：年份+季节+周次", "周次：第N周", "组别：原组别名", "题型：编程或理论题型", "知识点：按题面整理", "评测或答案获取状态"],
        "notes": ["按平台题目ID和题型去重，保留赛事、组别、题号关联。", "题面样例不是完整隐藏评测点。", "未自动归入任何 GESP 级别。"],
    }
    dump(out / "summary.json", summary)
    dump(out / "contests.json", contests)
    dump(out / "problems.json", problems)
    dump(out / "errors.json", errors)
    with (out / "赛事导出情况.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["赛事", "年份", "季节", "第几周", "题目数", "状态", "链接"])
        for c in contests:
            writer.writerow([c["name"], c["year"], c["season"], c["week"], c["exportedProblemCount"], c["exportStatus"], c["pageUrl"]])
    with (out / "题目目录.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["题目ID", "题名", "赛期与组别", "第几周", "知识点", "完整标签", "样例数", "来源", "本地题面"])
        for p in problems:
            writer.writerow([p["platformProjectId"], p["title"], '；'.join(r["periodLabel"] + ' / ' + r["group"] for r in p["occurrences"]), '、'.join(str(w) for w in p["weeks"]), '、'.join(p.get('knowledgePoints', [])), '；'.join(p["tags"]), len(p["samples"]), "学而思", links[p['exportKey']]])
    body = '<h1>学而思赛事题目导出</h1><p>' + f'已检查 {len(contests)} 场赛事；{summary["contestsWithExportedProblems"]} 场取得题目，共 {len(problems)} 道去重题目、{summary["sampleCount"]} 组样例。' + '</p><p class="note">本包未包含平台隐藏评测点。没有题目的赛事见“赛事导出情况.csv”。</p><input id="search" placeholder="输入题名、赛事或组别筛选"><div>'
    for key, label in [('year', '全部年份'), ('season', '全部季节'), ('week', '全部周次'), ('group', '全部组别')]:
        values = sorted({r[key] for p in problems for r in p['occurrences'] if r.get(key) is not None})
        body += '<select id="' + key + '"><option value="">' + label + '</option>'
        for v in values:
            title = f'第{v}周' if key == 'week' else str(v)
            body += '<option value="' + html.escape(str(v), quote=True) + '">' + html.escape(title) + '</option>'
        body += '</select>'
    body += '<select id="knowledge"><option value="">全部知识点</option>'
    for point in sorted({v for p in problems for v in p.get('knowledgePoints', [])}):
        body += '<option>' + html.escape(point) + '</option>'
    body += '</select></div><table><thead><tr><th>题目</th><th>赛期与组别</th><th>知识点</th><th>样例数</th></tr></thead><tbody>'
    for p in problems:
        periods = [{key: r.get(key) for key in ('year', 'season', 'week', 'group')} for r in p['occurrences']]
        body += '<tr data-periods="' + html.escape(json.dumps(periods, ensure_ascii=False), quote=True) + '" data-knowledge="' + html.escape(json.dumps(p.get('knowledgePoints', []), ensure_ascii=False), quote=True) + '"><td><a href="' + links[p['exportKey']] + '">' + html.escape(p["title"]) + '</a></td><td>' + html.escape('；'.join(r["periodLabel"] + ' / ' + r["group"] for r in p["occurrences"])) + '</td><td>' + html.escape('、'.join(p.get('knowledgePoints', []))) + '</td><td>' + str(len(p["samples"])) + '</td></tr>'
    body += '</tbody></table>'
    script = '<script>const keys=["year","season","week","group"];function filter(){const q=document.getElementById("search").value.toLowerCase(),kp=document.getElementById("knowledge").value;document.querySelectorAll("tbody tr").forEach(r=>{const match=JSON.parse(r.dataset.periods).some(p=>keys.every(k=>!document.getElementById(k).value||String(p[k])===document.getElementById(k).value));r.hidden=!match||!r.textContent.toLowerCase().includes(q)||(kp&&!JSON.parse(r.dataset.knowledge).includes(kp))})}document.getElementById("search").addEventListener("input",filter);[...keys,"knowledge"].forEach(k=>document.getElementById(k).addEventListener("change",filter));</script>'
    (out / "index.html").write_text(page("学而思赛事题目导出", body, script), encoding="utf-8")
    (out / "说明.txt").write_text(
        f'学而思赛事题目导出\n\n已检查 {len(contests)} 场赛事，导出 {len(problems)} 道去重题目、{summary["sampleCount"]} 组公开样例。\n'
        '解压后双击 index.html 可离线浏览和搜索。problems.json 为合并结构化题库；每题目录含题面、JSON 和样例 .in/.out 文件。\n'
        '每题标记来源、赛事、组别、题型、评测完整性；赛事和组别关联保存在 occurrences 中，未强行归入 GESP 5 级。\n'
        '原始隐藏评测点未取得；cases 中仅有题面样例，没有假装补齐评测数据。\n'
        '赛事导出情况.csv 记录全部赛事；errors.json 记录访问错误或缺失数据。未返回入口不等于该赛事没有题目。\n'
        f'HTML 保留题面格式并随包携带公式显示组件；已保存 {len(image_map)} 张题面配图和代码截图。\n'
        '知识点由本次根据题面人工整理，不是平台原有知识点标签；一道题可能存在多种解法。\n'
        'CSV 带 UTF-8 BOM；ZIP 中文文件名使用 UTF-8。导出内容不含登录凭据、个人账户资料或个人作答代码。\n', encoding="utf-8-sig")
    hashes = [(p.relative_to(out).as_posix(), hashlib.sha256(p.read_bytes()).hexdigest()) for p in sorted(out.rglob("*")) if p.is_file() and p.name != "SHA256SUMS"]
    (out / "SHA256SUMS").write_text(''.join(f'{digest}  {name}\n' for name, digest in hashes), encoding="utf-8")
    archive = out.with_suffix(".zip")
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(out.rglob("*")):
            if p.is_file():
                z.write(p, p.relative_to(out).as_posix())
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for name, digest in hashes:
            assert hashlib.sha256(z.read(name)).hexdigest() == digest
        for info in z.infolist():
            if not info.filename.isascii():
                assert info.flag_bits & 0x800
    print(json.dumps({"summary": summary, "archive": str(archive.resolve())}, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--token-file", required=True, type=Path)
    parser.add_argument("--cache-dir", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--jobs", type=int, default=4)
    parser.add_argument("--knowledge-file", type=Path)
    parser.add_argument("--image-cache", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit("Output directory already exists; choose a new directory to avoid stale files.")
    if args.output.resolve() in args.cache_dir.resolve().parents or args.output.resolve() == args.cache_dir.resolve():
        raise SystemExit("Response cache must be outside the export directory.")
    client = Client(args.token_file, args.cache_dir)
    contests = []
    number = 1
    while True:
        response = client.get("/portal/serial/list", {"pageNum": number, "pageSize": 100})
        if response.get("status") != 200:
            raise SystemExit(f'Cannot read catalog: {response.get("status")}')
        data = response["data"]
        contests.extend(data["list"])
        if not data["hasNextPage"]:
            break
        number += 1
    assert len({c["competitionId"] for c in contests}) == len(contests) == data["total"]
    print(f"Catalog: {len(contests)}", flush=True)
    errors = []
    by_id = {c["competitionId"]: c for c in contests}
    question_pages = []
    for c in contests:
        c.update(pages=[], bundles=[], problemReferences=[], errors=[])
    for cid, result in parallel("Contest pages", list(by_id), lambda cid: client.get("/user/public/getCompPage", {"id": cid}), args.jobs):
        c = by_id[cid]
        if result.get("status") != 200 or not isinstance(result.get("data"), dict):
            error = {"stage": "contest", "competitionId": cid, "status": result.get("status"), "message": result.get("message")}
            errors.append(error); c["errors"].append(error)
            continue
        for p in result["data"].get("compPageDtoList", []):
            c["pages"].append({"id": p["id"], "name": p["name"]})
            if p["name"] not in NON_QUESTION_PAGES:
                question_pages.append({"competitionId": cid, "pageId": p["id"], "group": p["name"]})
    dump(args.cache_dir / "progress-contests.json", contests)
    bundles = {}
    for ref, result in parallel("Question groups", question_pages, lambda p: client.get("/user/public/getCompModuleList", {"id": p["pageId"]}), args.jobs):
        c = by_id[ref["competitionId"]]
        if result.get("status") != 200 or not isinstance(result.get("data"), list):
            error = dict(ref, stage="page", status=result.get("status"), message=result.get("message"))
            errors.append(error); c["errors"].append(error)
            continue
        for module in result["data"]:
            for b in module.get("subjectDtoList", []):
                b = {k: b.get(k) for k in ("bundleId", "bundleName", "published", "publishTiming", "everUnPublished")}
                b.update(ref)
                c["bundles"].append(b)
                bundles[b["bundleId"]] = b
    dump(args.cache_dir / "progress-contests.json", contests)
    references = {}
    for bid, result in parallel("Problem bundles", list(bundles), lambda bid: client.get("/subject/s-practices", {"bundleId": bid}), args.jobs):
        b = bundles[bid]; c = by_id[b["competitionId"]]
        if result.get("status") != 200 or not isinstance(result.get("data"), dict):
            error = {"stage": "bundle", "bundleId": bid, "competitionId": c["competitionId"], "status": result.get("status"), "message": result.get("message")}
            errors.append(error); c["errors"].append(error); b["readStatus"] = error
            continue
        data = result["data"]
        b["canLook"] = data.get("canLook")
        b["practiceTotal"] = data.get("practiceTotal")
        if data.get("canLook") is False:
            b["readStatus"] = "平台不允许查看，未请求题面"
            continue
        for number, item in enumerate(data.get("practices", []), 1):
            ref = {"competitionId": c["competitionId"], "contestName": c["name"], "group": b["group"], "bundleId": bid, "projectId": item["projectId"], "number": number, "title": item["practiceName"], "category": item["category"], "sourceUrl": c["pageUrl"] + '#/studentComplier?bundleId=' + urllib.parse.quote(bid)}
            c["problemReferences"].append(ref)
            if item["category"] not in (4, 9, 5, 6):
                error = dict(ref, stage="problem", message="当前导出器尚未支持此题型，已记录入口")
                errors.append(error); c["errors"].append(error)
                continue
            references.setdefault(problem_key(item["projectId"], item['category']), []).append(ref)
    dump(args.cache_dir / "progress-contests.json", contests)

    def fetch_problem(pid):
        # Try only bundle links the account itself was returned, without guessing IDs.
        for ref in references[pid]:
            if ref['category'] in (4, 9):
                result = client.get('/cpp/exercise/' + ref["bundleId"] + '/' + str(ref['projectId']))
            else:
                result = client.get('/paper/question' if ref['category'] == 6 else '/choice/question', {'id': ref['projectId']})
            if result.get("status") == 200 and result.get("data"):
                return result
        return result

    problems = []
    for pid, result in parallel("Problem statements", list(references), fetch_problem, args.jobs):
        if result.get("status") != 200 or not result.get("data"):
            error = {"stage": "problem", "projectId": pid, "status": result.get("status"), "message": result.get("message")}
            errors.append(error)
            for ref in references[pid]:
                by_id[ref["competitionId"]]["errors"].append(error)
            continue
        try:
            data = result["data"]
            if references[pid][0]['category'] in (4, 9):
                assert str(data["projectId"]) == pid
                assert data.get("descMD") or data.get("description")
                problems.append(problem_record(data, references[pid]))
            else:
                if isinstance(data, str):
                    data = json.loads(base64.urlsafe_b64decode(data + '=' * (-len(data) % 4)))
                assert isinstance(data, dict)
                problems.append(theory_record(data, references[pid]))
        except (AssertionError, KeyError, ValueError, TypeError) as exc:
            error = {"stage": "problem-conversion", "projectId": pid, "message": type(exc).__name__}
            errors.append(error)
            for ref in references[pid]:
                by_id[ref["competitionId"]]["errors"].append(error)
    problems.sort(key=lambda p: (p['kind'], str(p["platformProjectId"])))
    if args.knowledge_file:
        knowledge = json.loads(args.knowledge_file.read_text())
        for problem in problems:
            points = knowledge.get(problem['exportKey'])
            assert isinstance(points, list) and points, 'Missing knowledge labels: ' + problem['exportKey']
            problem['knowledgePoints'] = points
            problem['knowledgePointSource'] = '根据题面人工整理，非平台原始知识点标签'
            problem['tags'] += ['知识点：' + point for point in points]
    export_files(args.output, contests, problems, errors, len(question_pages), len(bundles), args.image_cache)
    # Check every packaged file for accidental credential inclusion.
    with zipfile.ZipFile(args.output.with_suffix(".zip")) as z:
        for name in z.namelist():
            assert client.token.encode() not in z.read(name)


if __name__ == "__main__":
    main()
