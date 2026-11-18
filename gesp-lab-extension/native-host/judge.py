"""Local-only C++ judge demo. Not a security sandbox for untrusted users."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
HOST, PORT = "127.0.0.1", 8765
MAX_BODY = 200_000
MAX_OUTPUT = 100_000
DEFAULT_CASES = []  # The Chrome extension supplies the active problem's cases.
IS_WINDOWS = os.name == "nt"


def cleanup_workspace(folder):
    """Windows may keep an exited executable open briefly (e.g. a scanner).

    Cleanup must never replace the run/compile result or an original exception.
    Retry only this request's directory, never sweep other processes' folders.
    """
    delays = (0, .05, .1, .2, .4, .8)
    for attempt, delay in enumerate(delays):
        if delay:
            time.sleep(delay)
        try:
            shutil.rmtree(folder)
            return True
        except FileNotFoundError:
            return True
        except OSError as exc:
            if attempt == len(delays) - 1:
                # Native Messaging reserves stdout for framed JSON.
                try:
                    print(f"评测临时目录暂未清理，运行结果不受影响：{folder}: {exc}", file=sys.stderr)
                except OSError:
                    pass  # A closed diagnostic stream must not mask the verdict either.
    return False


@contextmanager
def judge_workspace():
    folder = tempfile.mkdtemp(prefix="cpp_oj_")
    try:
        yield folder
    finally:
        cleanup_workspace(folder)


def compiler_path():
    configured = os.environ.get("CXX", "").strip().strip('"')
    if configured:
        return configured
    for name in ("g++", "clang++"):
        found = shutil.which(name)
        if found:
            return found
    return None


def execute(command, *, stdin="", timeout=2, cwd=None):
    try:
        # start_new_session lets POSIX terminate the process group on timeout.
        kwargs = {"start_new_session": True} if not IS_WINDOWS else {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
        with subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, cwd=cwd, **kwargs) as p:
            try:
                out, err = p.communicate(stdin.encode("utf-8"), timeout=timeout)
                return {"code": p.returncode, "out": out[:MAX_OUTPUT].decode("utf-8", "replace"),
                        "err": err[:MAX_OUTPUT].decode("utf-8", "replace"), "timeout": False}
            except subprocess.TimeoutExpired:
                if IS_WINDOWS:
                    try:
                        subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True, timeout=3)
                    except (OSError, subprocess.TimeoutExpired):
                        pass
                else:
                    import signal
                    try:
                        os.killpg(p.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass  # The process exited between timeout and termination.
                if p.poll() is None:
                    p.kill()
                out, err = p.communicate()
                return {"code": -1, "out": out[:MAX_OUTPUT].decode("utf-8", "replace"),
                        "err": err[:MAX_OUTPUT].decode("utf-8", "replace"), "timeout": True}
    except OSError as exc:
        return {"code": -1, "out": "", "err": str(exc), "timeout": False}


def normalize(s):
    return "\n".join(line.rstrip() for line in s.replace("\r\n", "\n").strip().split("\n"))


def judge(payload):
    source = payload.get("code", "")
    mode = payload.get("mode", "run")
    if not isinstance(source, str) or not source.strip() or len(source) > 100_000:
        raise ValueError("代码不能为空，且不得超过 100KB")
    if mode not in ("run", "judge"):
        raise ValueError("无效模式")
    compiler = compiler_path()
    if not compiler:
        raise ValueError("未找到 g++ / clang++。请安装编译器或设置 CXX 环境变量。")
    cases = payload.get("cases", DEFAULT_CASES) if mode == "judge" else []
    if mode == "judge":
        if not isinstance(cases, list) or not 1 <= len(cases) <= 30:
            raise ValueError("评测点数量需要在 1～30 之间")
        for case in cases:
            if not isinstance(case, dict) or not isinstance(case.get("input"), str) or not isinstance(case.get("expected"), str) or not isinstance(case.get("score"), int) or not 0 <= case["score"] <= 100 or len(case["input"]) > 100_000 or len(case["expected"]) > 100_000:
                raise ValueError("评测点格式不正确")
    with judge_workspace() as temp:
        folder = Path(temp)
        (folder / "main.cpp").write_text(source, encoding="utf-8")
        binary = folder / ("program.exe" if os.name == "nt" else "program")
        compile_result = execute([compiler, "-std=c++17", "-O2", "-o", str(binary), "main.cpp"], timeout=15, cwd=temp)
        if compile_result["timeout"] or compile_result["code"] != 0:
            return {"status": "CE", "message": "编译超时" if compile_result["timeout"] else "编译失败", "compile": compile_result["err"], "results": [], "score": 0}
        if mode == "run":
            input_text = payload.get("input", "")
            if not isinstance(input_text, str) or len(input_text) > 100_000:
                raise ValueError("输入不能超过 100KB")
            started = time.monotonic()
            result = execute([str(binary)], stdin=input_text, timeout=2, cwd=temp)
            elapsed = round((time.monotonic() - started) * 1000)
            status = "TLE" if result["timeout"] else ("RE" if result["code"] != 0 else "OK")
            return {"status": status, "output": result["out"], "error": result["err"], "timeMs": elapsed, "compile": compile_result["err"]}
        results = []
        score = 0
        for i, case in enumerate(cases):
            started = time.monotonic()
            result = execute([str(binary)], stdin=case["input"], timeout=2, cwd=temp)
            elapsed = round((time.monotonic() - started) * 1000)
            status = "TLE" if result["timeout"] else ("RE" if result["code"] != 0 else ("AC" if normalize(result["out"]) == normalize(case["expected"]) else "WA"))
            points = case["score"] if status == "AC" else 0
            score += points
            results.append({"id": i + 1, "status": status, "score": points,
                            "maxScore": case["score"], "timeMs": elapsed,
                            "actual": result["out"][:1000], "expected": case["expected"][:1000]})
        return {"status": "AC" if all(x["status"] == "AC" for x in results) else "PARTIAL",
                "score": score, "maxScore": sum(x["score"] for x in cases), "results": results,
                "compile": compile_result["err"]}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        if path not in ("/", "/index.html", "/problem.json"):
            self.send_error(404)
            return
        name = "index.html" if path in ("/", "/index.html") else "problem.json"
        data = (ROOT / name).read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8" if name.endswith("html") else "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if urlsplit(self.path).path != "/api/execute":
            self.send_error(404)
            return
        origin = self.headers.get("Origin")
        if origin and origin != f"http://{HOST}:{PORT}":
            self.send_error(403, "Only this local page may submit code")
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                raise ValueError("请求过大")
            payload = json.loads(self.rfile.read(length))
            result = judge(payload)
            status = 200
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            result, status = {"error": str(exc)}, 400
        data = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    print(f"本地 C++ OJ: http://{HOST}:{PORT}")
    print(f"编译器: {compiler_path() or '未找到'}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
