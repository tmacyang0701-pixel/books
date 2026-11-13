"""Check the launcher's network context without sending a key or generating tokens."""
import argparse
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, build_opener, ProxyHandler

from .model import GenerationError, connection_error, settings


def check_network(cfg, timeout=8):
    report = dict(model=cfg['model'], configured=bool(cfg['key']), reachable=False,
                  modelVerified=False)
    # Use the same direct network path as completion(), but never send Authorization.
    req = Request(cfg['base'] + '/models', headers={'Accept': 'application/json'})
    try:
        with build_opener(ProxyHandler({})).open(req, timeout=timeout) as response:
            status = response.status
    except HTTPError as exc:
        status = exc.code
        exc.close()
    except (URLError, OSError) as exc:
        error = connection_error(exc)
        return dict(report, code=error.code, message=str(error))
    # Even an unauthenticated 401 proves an HTTP response, not model authorization.
    return dict(report, reachable=True, code='reachable', httpStatus=status,
                message=f'千问地址已响应（HTTP {status}）；具体模型权限和额度将在生成时验证。')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--config-only', action='store_true')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args()
    try:
        cfg=settings()
        if not cfg['key']:
            report=dict(reachable=False,configured=False,code='not_configured',message='未配置百炼密钥，请先填写 learning_service/.env。')
        elif args.config_only:
            report=dict(reachable=False,configured=True,code='configured',model=cfg['model'],port=cfg['port'],message='模型配置已读取，网络尚未检查。')
        else: report = check_network(cfg)
    except (GenerationError, OSError, ValueError, KeyError):
        report = dict(reachable=False, code='config', message='无法读取模型配置，请检查 learning_service/config.json 与 explanation/.env。')
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report,ensure_ascii=True) if args.json else report['message'])
    if not report.get('configured',False) or (not args.config_only and not report['reachable']):
        raise SystemExit(2)


if __name__ == '__main__':
    main()
