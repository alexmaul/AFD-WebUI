import os.path
import requests
import re
import magic
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
            data = collect_info(action.split("/")[1])
        elif action.startswith("config"):
            cmd = "get_dc_data"
            cmd_opt = "-h"
            data = exec_cmd("{} {} {}".format(cmd, cmd_opt, action.split("/")[1]), True)
        return make_response(data, {"Content-type": "text/plain"})
    else:
        return abort(405)


def collect_info(host):
    field_values = {}
    raw = exec_cmd("fsa_view {}".format(host), True)
    for l in raw.split("\n"):
        if not len(l) or l[0] in (" ", "="):
            continue
        if l[0] == "-":
            break
        le = [x.strip() for x in l.split(":")]
        if len(le) < 2:
            continue
        if le[0] == "Hostname (display)":
            field_values["hostname"] = le[1].strip("><")
        elif le[0] == "Real hostname 1":
            field_values["real1"] = le[1]
        elif le[0] == "Real hostname 2":
            field_values["real2"] = le[1]
        elif le[0] == "Host toggle":
            field_values["active"] = le[1]
        elif le[0] == "Host toggle string":
            field_values["togglestr"] = (le[1][1], le[1][2])
        elif le[0] == "File counter done":
            field_values["filetransf"] = le[1]
        elif le[0] == "Bytes send":
            field_values["bytetransf"] = le[1]
        elif le[0] == "Last connection":
            field_values["lastcon"] = le[1]
        elif le[0] == "Connections":
            field_values["connects"] = le[1]
        elif le[0] == "Total errors":
            field_values["toterr"] = le[1]
        elif le[0] == "Retry interval":
            field_values["retrint"] = le[1]
        elif le[0].startswith("Protocol"):
            field_values["protocol"] = le[1]
    print(field_values)
    
    data="""
    <table class="info-box">
    <tr>
        <td class="info-column"></td>
        <td class="info-column"><input type="text" readonly></input></td>
        <td class="info-column"></td>
        <td class="info-column"><input type="text" readonly></input></td>
    </tr>
    <tr> <td></td> <td></td> <td></td> <td></td> </tr>
    </table>
    """.format(
        
        )
    
    return data


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
    from_file = {
        "system":           "SYSTEM_LOG.",
        "receive":          "RECEIVE_LOG.",
        "transfer":         "TRANSFER_LOG.",
        "transfer_debug":   "TRANS_DB_LOG."
    }
    if typ in from_file:
        return log_from_file(from_file[typ])
    else:
        return log_from_alda(typ)


def log_from_file(file_name):
    file_number = request.form["file"]
    level_filter = request.form["filter"]
    if (file_number == "all"):
        file_number = "*"
    data = exec_cmd(
        # TODO: statt exec datei selbst filtern und ausgabe als tr/td aufbereiten.
        "bash -c \"grep -shP '<({})>' {}/log/{}{}\"".format(
            level_filter, afd_work_dir, file_name, file_number
            ),
        True
        )
    return make_response(data, {"Content-type": "text/plain"})


def log_from_alda(typ):
    alda_output_format = {
        "input":            "-o \"<tr><td class='clst-dd'>%ITm.%ITd.</td><td class='clst-hh'>%ITH:%ITM:%ITS</td><td>%IF</td><td class='clst-fs'>%OSB</td></tr>\"",
        "output":           "-o \"<tr archive='|%OA/%xOZu_%xOU_%xOL_%Of|'><td class='clst-dd'>%OTm.%OTd.</td><td class='clst-hh'>%OTH:%OTM:%OTS</td><td>%Of</td><td class='clst-hn'>%OH</td><td class='clst-tr'>%OP</td><td class='clst-fs'>%OSB</td><td class='clst-tt'>%ODA</td><td class='clst-aa'>|N|</td></tr>\"",
        "delete":           "-o \"<tr><td class='clst-dd'>%DTm.%DTd.</td><td class='clst-hh'>%DTH:%DTM:%DTS</td><td>%DF</td><td class='clst-fs'>%DSB</td><td class='clst-hn'>%DH</td><td class='clst-rn'>%DR</td><td class='clst-pu'>%DW</td></tr>\""
    }
    par_tr = {
            "start":         "-t ",
            "end":           "-T ",
            "directory":     "-d ",
            "recipient":     "-h ",
            "filesize":      "-S ",
            "job_id":        "-j ",
            "protocol":      "-p ",
            "trans-time":    "-D ",
            "delete-reason": None,
        }
    par_lst = []
    fnam = ""
    if request.form.get("received-only", None):
        logtype = "R"
    else:
        logtype = typ[0].upper()
    if request.form.get("archived-only", None):
        archived_only = True
    else:
        archived_only = False
    app.logger.debug(request.form)
    alda_output_line = alda_output_format.get(typ, "")
    for key, val in request.form.items():
        if key in par_tr and par_tr[key] is None:
            continue
        elif key == "filename":
            fnam = val
        elif key == "recipient":
            rl = ",".join("%" + v for v in val.split(","))
            par_lst.append("{}'{}'".format(par_tr[key], rl))
        elif key == "output-filename-remote" and val in ("on", "yes", "true"):
            alda_output_line = alda_output_line.replace("%Of", "%OF")
        elif key in par_tr and val == "true":
            par_lst.append(par_tr[key])
        elif key in par_tr:
            par_lst.append(par_tr[key] + val)
    cmd = "alda -f -L {} {} {} {}".format(logtype,
                                       " ".join(par_lst),
                                       alda_output_line,
                                       fnam)
    data = exec_cmd(cmd, True)
    if typ == "output":
        # Parse each line, and set archive flag.
        new_data = []
        for data_line in data.split("\n"):
            if not data_line:
                continue
            parts = data_line.split("|")
            if not parts[1].startswith("/"):
                if os.path.exists(os.path.join(afd_work_dir, "archive", parts[1])):
                    parts[-2] = "Y"
                else:
                    parts[-2] = "D"
            else:
                parts[1] = ""
                parts[-2] = "N"
            if not archived_only or parts[-2] == "Y":
                new_data.append("".join(parts))
        data = "\n".join(new_data)
    return make_response(data, {"Content-type": "text/plain"})


@app.route("/view/<mode>/<path:arcfile>", methods=["GET"])
def view(mode="auto", arcfile=None):
    content = ""
    arcfile_path = os.path.join(afd_work_dir, "archive", arcfile)
    if not os.path.exists(arcfile_path):
        return abort(404)
    if mode == "auto":
        content_type = magic.from_file(arcfile_path, mime=True)
        if content_type == "application/octet-stream":
            m = re.match(".*[-.](\w+)$", arcfile)
            if m is not None and m.group(1) in ("bufr", "wmo"):
                mode = "bufr"
            else:
                mode = "hexdump"
    if mode in ("hexdump", "od"):
        content_type = "text/plain"
        content = exec_cmd(
            "bash -c \"hexdump -C {}\"".format(arcfile_path),
            True
            )
    elif mode == "bufr":
        content_type = "text/html"
        with open(arcfile_path, "rb") as fh_in:
            decode_url = "http://informatix.dwd.de/cgi-bin/pytroll/bufr/decode.py"
            r = requests.post(decode_url, files={"file": fh_in})
            app.logger.debug("forward-to: %s - %d", decode_url, r.status_code)
            if r.status_code == 200:
                content = r.content
    else:
        with open(arcfile_path, "rb") as fh_in:
            content = fh_in.read()
            content_type = magic.from_buffer(content, mime=True)
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
