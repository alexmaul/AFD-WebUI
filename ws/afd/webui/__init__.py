import os.path
import requests
from shlex import split as shlex_split
from flask import (Flask, request, url_for, render_template,
                   redirect, Markup, json, make_response, abort)
from subprocess import Popen, PIPE, CalledProcessError

app = Flask(__name__)
afd_work_dir = None


@app.route("/")
def index():
    return redirect(url_for("static", filename="html/afd-gui.html"), code=303)


@app.route("/fsa/json", methods=["GET"])
def fsa():
    data = '{"data":' + exec_cmd("fsa_view_json", True) + "}"
    return make_response(data, {"Content-type": "application/json"})


@app.route("/alias/<path:action>", methods=["POST", "GET"])
def alias(action=None):
    app.logger.debug("action: %s", action)
    app.logger.debug(request.form)
    cmd = "afdcmd"
    cmd_opt = ""
    if request.method == "POST":
        alias_list = request.form["alias"].split(",")
        if action == "start":
            cmd_opt = "-t -q"
        elif action == "stop":
            cmd_opt = "-T -Q"
        elif action == "able":
            cmd_opt = "-X"
        elif action == "debug":
            cmd_opt = "-d"
        elif action == "trace":
            cmd_opt = "-c"
        elif action == "fulltrace":
            cmd_opt = "-C"
        elif action == "switch":
            cmd_opt = "-s"
        elif action == "retry":
            cmd_opt = "-r"
        exec_cmd("{} {} {}".format(cmd, cmd_opt, " ".join(alias_list)), False)
        return make_response("", 204, {"Content-type": "text/plain"})
    elif request.method == "GET":
        if action.startswith("info"):
            cmd = "get_hostname "
            cmd_opt = "-h"
        elif action.startswith("config"):
            cmd = "get_dc_data"
            cmd_opt = "-h"
        data = exec_cmd("{} {} {}".format(cmd, cmd_opt, action.split("/")[1]), True)
        return make_response(data, {"Content-type": "text/plain"})
    else:
        return abort(405)


@app.route("/afd/<command>/<action>", methods=["GET", "POST"])
def afd(command=None, action=None):
    app.logger.debug("command: %s   action: %s", command, action)
    app.logger.debug(request.form)
    cmd = "afdcmd"
    cmd_opt = ""
    if request.method == "GET":
        if command == "amg":
            if action == "toggle":
                cmd = "afdcmd"
                cmd_opt = "-Y"
        elif command == "fd":
            if action == "toggle":
                cmd = "afdcmd"
                cmd_opt = "-Z"
        elif command == "dc":
            if action == "update":
                cmd = "udc"
                cmd_opt = ""
        elif command == "hc":
            if action == "update":
                cmd = "uhc"
                cmd_opt = ""
        elif command == "afd":
            if action == "start":
                cmd = "afd"
                cmd_opt = " -a"
            elif action == "stop":
                cmd = "afd"
                cmd_opt = "-s"
        exec_cmd("{} {}".format(cmd, cmd_opt))
        return make_response("", 204, {"Content-type": "text/plain"})
    elif request.method == "POST" and command == "hc" and action == "change":
        r = save_hc(request.form)
        if r:
            return make_response(r, 500, {"Content-type": "text/plain"})
        else:
            return make_response("", 204, {"Content-type": "text/plain"})
    else:
        return abort(400)


@app.route("/alda/<typ>", methods=["POST"])
def alda(typ=None):
    alda_output_format = {
        "system":           "",
        "receive":          "",
        "transfer":         "",
        "transfer_debug":   "",
        "input":            "",
        "output":           "",
        "delete":           ""
    }
    from_file = {
        "system":           "SYSTEM_LOG.",
        "receive":          "RECEIVE_LOG.",
        "transfer":         "TRANSFER_LOG.",
        "transfer_debug":   "TRANS_DB_LOG."
    }
    if typ in from_file:
        fnam = from_file[typ]
        fnum = request.form["file"]
        filt = request.form["filter"]
        if (fnum == "all"):
            fnum = "*"
        data = exec_cmd(
            "bash -c \"grep -shP '<({})>' {}/log/{}{}\"".format(
                filt, afd_work_dir, fnam, fnum
                ),
            True
            )
    else:
        par_tr = {
               "start":          "-t ",
                "end":           "-T ",
                "directory":     "-d ",
                "recipient":     "-h ",
                "filesize":      "-S ",
                "job_id":        "-j ",
                "protocol":      "-p ",
                "only_archived": "",
                "trans_time":    "-D ",
                "delete_reason": "",
            }
        par_lst = []
        fnam = ""
        if request.form.get("only_received", None):
            logtype = "R"
        else:
            logtype = typ[0].upper()
        app.logger.debug(request.form)
        for key, val in request.form.items():
            if key == "filename":
                fnam = val
            elif key == "recipient":
                rl = ",".join("%" + v for v in val.split(","))
                par_lst.append("{}'{}'".format(par_tr[key], rl))
            elif key in par_tr and val == "true":
                par_lst.append(par_tr[key])
            elif key in par_tr:
                par_lst.append(par_tr[key] + val)
        cmd = "alda -f -L {} {} {} {}".format(logtype,
                                           " ".join(par_lst),
                                           alda_output_format.get(typ, ""),
                                           fnam)
        data = exec_cmd(cmd, True)
    return make_response(data, {"Content-type": "text/plain"})


@app.route("/view/<mode>/<path:file>", methods=["GET"])
def view(mode="auto", file=None):
    content = ""
    content_type = "text/plain"
    if mode == "auto":
        # TODO: determine action from file type.
        pass
    if mode == "bufr":
        content_type = "text/html"
        with open(afd_work_dir + "/" + file, "rb") as fh_in:
            decode_url = "http://informatix.dwd.de/cgi-bin/pytroll/bufr/decode.py"
            r = requests.post(decode_url, files={"file": fh_in})
            app.logger.debug("forward-to: %s - %d", decode_url, r.status_code)
            if r.status_code == 200:
                content = r.content
    else:  # "od"
        content = exec_cmd("bash -c \"hexdump -C {}\"".format(afd_work_dir + "/" + file), True)
    return make_response(content, 200 if len(content) else 204, {"Content-type": content_type})


def exec_cmd(cmd, read=False):
    result = ""
    try:
        exec_args = shlex_split(cmd)
        app.logger.debug("prepare command: %s" % exec_args)
        with Popen(exec_args,
                   stdout=PIPE,
                   stderr=PIPE,
                   universal_newlines=True,
                   encoding="latin-1"
                   ) as xh_proc:
            if read:
                result = xh_proc.stdout.read()
            if xh_proc.wait() != 0:
                app.logger.warning("command return: %d: %s",
                               xh_proc.wait(),
                               xh_proc.stderr.read()
                               )
        app.logger.debug("cmd: %s -> len=%d", cmd, len(result))
    except CalledProcessError as e:
        app.logger.exception(e)
    return  result


def save_hc(form):
    pass


def run():
    app.run()


if __name__ == "__main__":
    app.run()
