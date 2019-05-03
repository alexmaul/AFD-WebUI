import os.path
from os import environ
from shlex import split as shlex_split
from flask import Flask, request, url_for, render_template, redirect, Markup, json, make_response
from subprocess import Popen, PIPE, CalledProcessError

app = Flask(__name__)
AFD_WORK_DIR = environ["AFD_WORK_DIR"]

from logging import DEBUG
app.logger.setLevel(DEBUG)


@app.route("/")
def index():
    return redirect(url_for("static", filename="html/afd-gui.html"), code=302)


@app.route("/fsa/json", methods=["GET"])
def fsa():
    data = '{"data":' + exec_cmd("fsa_view_json", "plain") + "}"
    app.logger.debug(data)
    return make_response(data, {"Content-type": "application/json"})


@app.route("/afd", methods=["POST"])
def afd():
    pass


@app.route("/alda/<typ>", methods=["POST"])
def alda(typ=None):
    from_file = {"system":      "SYSTEM_LOG.",
                 "receive":     "RECEIVE_LOG.",
                 "transfer":    "TRANSFER_LOG.",
                 "transfer_debug": "TRANS_DB_LOG."}
    if typ in from_file:
        fnam = from_file[typ]
        fnum = request.form["file"]
        filt = request.form["filter"]
        data = exec_cmd(
            "grep -shP '<({})>' {}/log/{}{}".format(
                filt, AFD_WORK_DIR, fnam, fnum
                ),
            "plain"
            )
    else:
        par_tr = {
               "start":         "-t ",
                "end":          "-T ",
                "directory":    "-d ",
                "recipient":    "-h %",
                "filesize":     "-S ",
                "jobid":        "",
                "protocol":     "",
                "only_received": "",
                "only_archived": "",
                "trans_time":   "",
                "delete_reason": "",
            }
        par_lst = []
        app.logger.debug(request.form)
        for key, val in request.form.items():
            par_lst.append(par_tr[key] + val)
        cmd = "alda -f -L {} {}".format((typ[0]).upper(), " ".join(par_lst))
        data = exec_cmd(cmd, "plain")
    return data


def exec_cmd(cmd, expect=None):
    result = None
    try:
        exec_args = shlex_split(cmd)
        app.logger.debug("prepare command: %s" % exec_args)
        with Popen(exec_args,
                   stdout=PIPE,
                   stderr=PIPE,
                   universal_newlines=True,
                   encoding="latin-1"
                   ) as xh_proc:
            if expect is not None:
                result = xh_proc.stdout.read()
            if xh_proc.wait() != 0:
                app.logger.warning("command return: %d: %s",
                               xh_proc.wait(),
                               xh_proc.stderr.read()
                               )
    except CalledProcessError as e:
        app.logger.exception(e)
    return result


def run():
    app.run()


if __name__ == "__main__":
    app.run()
