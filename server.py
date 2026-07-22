#!/usr/bin/env python3
# ============================================================
# server.py — 우성사료 QR 데모(정적) 로컬 서버 (표준 라이브러리만 사용)
#   데모는 서버 없이도 동작하지만, 사내에서 로컬로 띄워볼 때를 위한 정적 서버.
#
# 실행:  python server.py            (기본 포트 8080)
#        python server.py -P 3000    (포트 지정 · 전산팀 표준 옵션)
#        python server.py 3000       (위치 인자로도 지정 가능 · 하위호환)
#        PORT=3000 python server.py  (환경변수로도 지정 가능)
#        python server.py -h         (도움말)
# ============================================================
import argparse
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DEFAULT_PORT = 8080


def resolve_port(argv):
    """실행 포트·호스트 결정.
    우선순위: -P/-p/--port  >  위치인자(python server.py 3000)  >  환경변수 PORT  >  기본 8080."""
    parser = argparse.ArgumentParser(
        prog='server.py',
        description='우성사료 QR 데모 정적 서버',
        epilog='예) python server.py -P 3000   |   python server.py 3000   |   PORT=3000 python server.py',
    )
    parser.add_argument('port_pos', nargs='?', metavar='PORT',
                        help='실행 포트(위치 인자, 예: server.py 3000)')
    parser.add_argument('-P', '-p', '--port', dest='port', type=int, metavar='PORT',
                        help='실행 포트 지정 (예: -P 3000)')
    parser.add_argument('--host', dest='host', default='0.0.0.0', metavar='HOST',
                        help='바인딩 호스트 (기본: 0.0.0.0 — 모든 인터페이스)')
    args = parser.parse_args(argv)

    port = args.port
    if port is None and args.port_pos:
        try:
            port = int(args.port_pos)
        except ValueError:
            parser.error('포트는 숫자여야 합니다: %r' % args.port_pos)
    if port is None:
        env = os.environ.get('PORT', '')
        if env.isdigit():
            port = int(env)
    if port is None:
        port = DEFAULT_PORT
    if not (1 <= port <= 65535):
        parser.error('포트 범위는 1~65535 입니다: %d' % port)
    return args.host, port


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    host, port = resolve_port(sys.argv[1:])
    try:
        httpd = ThreadingHTTPServer((host, port), SimpleHTTPRequestHandler)
    except OSError as e:
        print('서버를 시작할 수 없습니다 (포트 %d): %s' % (port, e))
        print('  → 다른 포트로 실행하세요. 예: python server.py -P 3000')
        raise SystemExit(1)
    shown = 'localhost' if host in ('0.0.0.0', '') else host
    print('우성사료 QR 데모 서버 실행 중')
    print('  - 접속:  http://%s:%d   (Ctrl+C 로 종료)' % (shown, port))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\n종료합니다.')
        httpd.shutdown()


if __name__ == '__main__':
    main()
