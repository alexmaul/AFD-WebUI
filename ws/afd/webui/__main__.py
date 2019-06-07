"""
AFD browser-based UI WebService
===============================

Command-line program, starts simple stand-alone Flask server.

For operational use consider a WSGI server,
e.g. Twistd:
twistd --pidfile=twistd.pid web --listen tcp:8040 --wsgi afd.webui.app
"""
import sys
from argparse import ArgumentParser, RawDescriptionHelpFormatter
import afd.webui


def parse_args():
    # Setup command-line argument parser
    parser = ArgumentParser(description=__import__("__main__").__doc__,
                            formatter_class=RawDescriptionHelpFormatter)
    parser.add_argument("-v", "--verbose",
                        dest="verbose",
                        action="count",
                        help="Log-Level. [default: 0]"
                        )
    parser.add_argument("-w", "--afd-work-dir",
                        metavar="PATH",
                        help="AFD_WORK_DIR, if not set as environment variable."
                        )
    parser.add_argument("-p", "--port",
                        default=8040,
                        help="Port this server shall bind to. [default: 8040]"
                        )
    args = parser.parse_args()
    # Setup logging
    if args.verbose:
        from logging import DEBUG, INFO
        if args.verbose == 1:
            afd.webui.app.logger.setLevel(INFO)
        elif args.verbose >= 2:
            afd.webui.app.logger.setLevel(DEBUG)
    return args


if __name__ == "__main__":
    args = parse_args()
    if "afd_work_dir" in args and args.afd_work_dir is not None:
        afd.webui.afd_work_dir = args.afd_work_dir
    sys.exit(afd.webui.app.run(host="0.0.0.0", port=args.port))
