import os.path
import requests
import re
import magic
from shlex import split as shlex_split
from flask import (Flask, request, url_for, render_template,
                   redirect, Markup, json, make_response, abort)
from subprocess import Popen, PIPE, CalledProcessError
from builtins import enumerate

app = Flask(__name__)
afd_work_dir = None

CONTENT_PLAIN = "text/plain"
CONTENT_JSON = "application/json"
CONTENT_HTML = "text/html"

HC_FIELD_NAME = 0
HC_FIELD_RADIO = 1
HC_FIELD_DEFAULT = 2
HC_FIELD_COLUMN = 3
HC_FIELD_BIT = 4

"""These field names tuple represent the fields in HOST_CONFIG.
Important is their exact order!
Fields for columns 3 (HostToggle) and 14 (SpecialFlag) and 20 (duplicate-check)
are flags, where the value "bit" in the tuple denotes the bit to set. If this
field "bit" is set to a value >=0 bit-arithmetic is applied.
For html-radio-input the column "radio-value" is taken in, too.
Special case: the fields "host_switch_*" are combined into one column.
"""
HC_FIELDS = (
    # field-name, radio-value, default, column, bit
    ("alias", None, "", 0, -1),  # AH
    ("host_name_real1", None, "", 1 , -1),  # HN1
    ("host_name_real2", None, "", 2 , -1),  # HN2
    ("host_switch_enable", None, "no", 3 , -2),  # HT
    ("host_switch_char1", None, "", 3, -2),  # HT
    ("host_switch_char2", None, "" , 3, -2),  # HT
    ("host_switch_auto", None, "no", 3, -2),  # HT    yes:{} no:[]
    ("proxy_name", None, "", 4, -1),  # PXY
    ("max_parallel_transfer", None, "3", 5, -1),  # AT
    ("max_errors", None, "10", 6, -1),  # ME
    ("retry_interval", None, "120", 7, -1),  # RI
    ("transfer_block_size", None, "4 KB", 8, -1),  # TB
    ("successful_retries", None, "0", 9, -1),  # SR
    ("filesize_offset_for_append", None, "None", 10, -1),  # FSO
    ("transfer_timeout", None, "60", 11, -1),  # TT
    ("no_burst", None, "0", 12, -1),  # NB
    ("host_status", None, "0", 13, -1),  # HS - Irrelevant for HC-edit page!
    ("ftpmode_passive", None, "no", 14, 0),  # SF:1 - FTP passive mode
    ("idle_time", None, "no", 14, 1),  # SF:2 - Set FTP idle time to transfer timeout
    ("keep_alive", None, "no", 14, 2),  # SF:3 - Send STAT command to keep control connection alive.
    ("fast_rename", None, "no", 14, 3),  # SF:4 - Combine RNFR and RNTO to one command.
    ("fast_cd", None, "no", 14, 4),  # SF:5 - Do not do a cd, always use absolute path.
    ("no_type_i", None, "no", 14, 5),  # SF:6 - Do not send TYPE I command.
    ("epsv_mode", None, "", 14, 6),  # SF:7 - Use extended active or extended passive mode.
    ("disable_burst", None, "", 14, 7),  # SF:8 - If set bursting is disabled.
    ("allow_redirect", None, "", 14, 8),  # SF:9 - If set FTP passive mode allows to be redirected to another address.
    ("use_local_scheme", None, "", 14, 9),  # SF:10 - When set it will replace the given scheme with file if the hostname matches local hostname or one in local_interface.list.
    ("tcp_keep_alive", None, "", 14, 10),  # SF:11 - Set TCP keepalive.
    ("sequence_locking", None, "", 14, 11),  # SF:12 - Set sequence locking.
    ("enable_compress", None, "", 14, 12),  # SF:13 - Enable compression.
    ("keep_timestamp", None, "", 14, 13),  # SF:14 - Keep time stamp of source file.
    ("sort_names", None, "", 14, 14),  # SF:15 - Sort file names.
    ("no_ageing_jobs", None, "", 14, 15),  # SF:16 - No ageing jobs.
    ("check_local_remote_match_size", None, "", 14, 16),  # SF:17 - Check if local and remote size match.
    ("is_timeout_transfer", None, "", 14, 17),  # SF:18 - Timeout transfer.
    ("keep_connected_direction", "send", "", 14, 18),  # SF:19 - Keep connected no fetching.
    ("keep_connected_direction", "fetch", "", 14, 19),  # SF:20 - Keep connected no sending.
    ("ftps_clear_ctrlcon", None, "", 14, 20),  # SF:21 - FTPS Clear Control Connection.
    ("ftp_use_list", None, "", 14, 21),  # SF:22 - Use FTP LIST for directory listing.
    ("tls_strict_verification", None, "", 14, 22),  # SF:23 - TLS uses strict verification of host.
    ("ftp_disable_mlst", None, "", 14, 23),  # SF:24 - Disables FTP MLST for directory listing.
    ("keep_connected_disconnect", None, "", 14, 24),  # SF:25 - Disconnect after given keep connected time.
    ("transfer_rate_limit", None, "0", 15, -1),  # TRL
    ("time_to_live", None, "0", 16, -1),  # TTL
    ("socket_send_buffer", None, "", 17, -1),  # SSB
    ("socket_receive_buffer", None, "", 18, -1),  # SRB
    ("dupcheck_timeout", None, "", 19, -1),  # DT
    ("dupcheck_type", "name", "", 20, 0),  # DF:1 - Only do CRC checksum for filename.
    ("dupcheck_type", "content", "", 20, 1),  # DF:2 - Only do CRC checksum for file content.
    ("dupcheck_type", "name-content", "", 20, 2),  # DF:3 - Checksum for filename and content.
    ("dupcheck_type", "name-no-suffix", "", 20, 3),  # DF:4 - Checksum of filename without last suffix.
    ("dupcheck_type", "name-size", "", 20, 4),  # DF:5 - Checksum of filename and size.
    ("dupcheck_crc", "crc32", "", 20, 15),  # DF:16 - Do a CRC32 checksum.
    ("dupcheck_crc", "crc32c", "", 20, 16),  # DF:17 - Do a CRC32C checksum.
    ("dupcheck_delete", None, "", 20, 23),  # DF:24 - Delete the file.
    ("dupcheck_store", None, "", 20, 24),  # DF:25 - Store the duplicate file.
    ("dupcheck_warn", None, "", 20, 25),  # DF:26 - Warn in SYSTEM_LOG.
    ("dupcheck_timeout_fixed", None, "", 20, 30),  # DF:31 - Timeout is fixed, ie. not cumulative.
    ("dupcheck_reference", "recipient", "", 20, 31),  # DF:32 - Use full recipient as reference instead of alias name.
    ("keep_connected", None, "", 21, -1),  # KC
    ("warn_time", None, "", 22, -1),  # WT    = warn_time_days+warn_time_hours+warn_time_mins+warn_time_secs
)


@app.route("/")
def index():
    return redirect(url_for("static", filename="html/afd-gui.html"), code=303)


@app.route("/fsa/json", methods=["GET"])
def fsa():
    data = '{"data":' + exec_cmd("fsa_view_json", True) + "}"
    return make_response(data, {"Content-type": CONTENT_JSON})


@app.route("/alias/info/<host>", methods=["POST"])
def alias_info_post(host):
    app.logger.debug("save info %s", host)
    app.logger.debug(request.form)
    try:
        fn_info = os.path.join(afd_work_dir, "etc", "INFO-" + host)
        with open(fn_info, "wt") as fh_info:
            fh_info.write(request.form.get("text", ""))
    except Exception as e:
        app.logger.warning(e)
        return abort(500)
    return make_response("", 204, {"Content-type": CONTENT_PLAIN})


@app.route("/alias/<action>", methods=["POST"])
def alias_post(action):
    app.logger.debug("action: %s", action)
    app.logger.debug(request.form)
    cmd = "afdcmd"
    cmd_opt = ""
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
    return make_response("", 204, {"Content-type": CONTENT_PLAIN})


@app.route("/alias/<action>/<host>", methods=["GET"])
def alias_get(action, host):
    app.logger.debug("action: %s", action)
    cmd = "afdcmd"
    cmd_opt = ""
    if action == "info":
        data = collect_info(host)
        return make_response(data, {"Content-type": CONTENT_HTML})
    elif action == "config":
        cmd = "get_dc_data"
        cmd_opt = "-h"
        data = exec_cmd("{} {} {}".format(cmd, cmd_opt, host), True)
        return make_response(data, {"Content-type": CONTENT_PLAIN})


def collect_info(host):
    field_values = {"HOST_ONE":  "",
                    "HOST_TWO":  "",
                    "info":      "No information available.",
                    }
    raw = exec_cmd("fsa_view {}".format(host), True)
    for l in raw.split("\n"):
        if not len(l) or l[0] == " ":
            continue
        if l[0] == "-":
            break
        if l[0] == "=":
            field_values["hostname"] = l.split(" ")[1]
            field_values["host1"] = field_values["hostname"]
            field_values["host2"] = field_values["hostname"]
        le = [x.strip() for x in l.split(":")]
        if len(le) < 2:
            continue
        if le[0] == "Real hostname 1":
            field_values["real1"] = le[1]
        elif le[0] == "Real hostname 2":
            field_values["real2"] = le[1]
        elif le[0] == "Host toggle":
            field_values[le[1]] = "checked"
        elif le[0] == "Host toggle string":
            field_values["host1"] = field_values["hostname"] + le[1][1]
            field_values["host2"] = field_values["hostname"] + le[1][2]
        elif le[0] == "File counter done":
            field_values["filetransf"] = le[1]
        elif le[0] == "Bytes send":
            field_values["bytetransf"] = le[1]
        elif le[0] == "Last connection":
            field_values["lastcon"] = ":".join(le[1:])
        elif le[0] == "Connections":
            field_values["connects"] = le[1]
        elif le[0] == "Total errors":
            field_values["toterr"] = le[1]
        elif le[0] == "Retry interval":
            field_values["retrint"] = le[1]
        elif le[0].startswith("Protocol"):
            field_values["protocol"] = le[1]
    print(field_values)

    fn_info = os.path.join(afd_work_dir, "etc", "INFO-" + field_values["hostname"])
    if os.path.exists(fn_info):
        with open(fn_info, "rt") as fh_info:
            field_values["info"] = fh_info.read()

    return render_template("info.html", **field_values)


@app.route("/afd/<command>", methods=["GET"])
@app.route("/afd/<command>/<action>", methods=["POST"])
def afd(command=None, action=None):
    app.logger.debug("command: %s   action: %s", command, action)
    app.logger.debug(request.form)
    cmd = "afdcmd"
    cmd_opt = ""
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
        if request.method == "GET":
            hc_data = json.dumps(read_hostconfig())
            return make_response(hc_data, {"Content-type": CONTENT_JSON})
        elif request.method == "POST":
            if action == "update":
                cmd = "uhc"
                cmd_opt = ""
            elif action == "save":
                r = save_hostconfig(request.form)
                if r:
                    return make_response(r, 500, {"Content-type": CONTENT_PLAIN})
                else:
                    return make_response("", 204, {"Content-type": CONTENT_PLAIN})
    elif command == "afd":
        if action == "start":
            cmd = "afd"
            cmd_opt = " -a"
        elif action == "stop":
            cmd = "afd"
            cmd_opt = "-s"
    else:
        return abort(400)
    exec_cmd("{} {}".format(cmd, cmd_opt))
    return make_response("", 204, {"Content-type": CONTENT_PLAIN})


def read_hostconfig():
    hc_order = []
    hc_data = {}

    def int_or_str(s):
        try:
            return int(s)
        except:
            return s

    with open(os.path.join(afd_work_dir, "etc", "HOST_CONFIG"), "rt") as fh_hc:
        for line in fh_hc:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            line_data = line.split(":")
            hc_order.append(line_data[HC_FIELD_NAME])
            hc_data[line_data[HC_FIELD_NAME]] = {}
            for hc_field in HC_FIELDS:
                print(hc_field[HC_FIELD_COLUMN], line_data[hc_field[HC_FIELD_COLUMN]])
                if hc_field[HC_FIELD_BIT] >= 0:
                    if int(line_data[hc_field[HC_FIELD_COLUMN]]) & (1 << hc_field[HC_FIELD_BIT]):
                        value = hc_field[HC_FIELD_RADIO] or "yes"
                    else:
                        value = "no"
                elif hc_field[3] == -2:
                    if line_data[hc_field[HC_FIELD_COLUMN]] != "":
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_enable"] = "yes"
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_auto"] = "yes" if line_data[hc_field[HC_FIELD_COLUMN]][0] == "{" else "no"
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_char1"] = line_data[hc_field[HC_FIELD_COLUMN]][1]
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_char2"] = line_data[hc_field[HC_FIELD_COLUMN]][2]
                    else:
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_enable"] = "no"
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_auto"] = "no"
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_char1"] = ""
                        hc_data[line_data[HC_FIELD_NAME]]["host_switch_char2"] = ""
                else:
                    value = line_data[hc_field[HC_FIELD_COLUMN]]
                hc_data[line_data[HC_FIELD_NAME]][hc_field[HC_FIELD_NAME]] = int_or_str(value)
    return {"order":hc_order, "data":hc_data}


def save_hostconfig(form):
    tmp_fn_hc = os.path.join(afd_work_dir, "etc", ".HOST_CONFIG")
    # Read current content of HOST_CONFIG
    hc = read_hostconfig()
    app.logger.debug(form)
    if form.get("submit") == "order":
        # Replace the host order
        hc["order"] = form["order"]
    if form.get("submit") == "data":
        # Replace all values for one host with those from the request.form
        hc["data"][form["alias"]] = {n[0]:form.get(n[0], "")
                                     for n
                                     in HC_FIELDS}
    with open(tmp_fn_hc, "wt") as fh_hc:
        # Write a new HOST_CONFIG to a temporary file.
        for alias in hc["order"]:
            line_data = [None * 23]
            hc_toggle = {}
            for tuplevalue_field, tuplevalue_radio, tuplevalue_default, tuplevalue_column, tuplevalue_bit in HC_FIELDS:
                if tuplevalue_bit >= 0:
                    column_value = line_data[tuplevalue_column]
                    if column_value is None:
                        column_value = 0
                    if hc["data"][alias].get(tuplevalue_field, "no") in ("yes", tuplevalue_radio):
                        column_value = column_value | 1 << tuplevalue_bit
                    else:
                        column_value = column_value & ~(1 << tuplevalue_bit)
                    line_data[tuplevalue_column] = column_value
                elif tuplevalue_bit == -1:
                    line_data[tuplevalue_column] = hc["data"][alias].get(tuplevalue_field, tuplevalue_default)
                elif tuplevalue_bit == -2:
                    hc_toggle[tuplevalue_field] = hc["data"][alias][tuplevalue_field]
            if hc_toggle["host_switch_enable"] == "yes":
                if hc_toggle["host_switch_auto"] == "yes":
                    line_data[3] = "\{{host_switch_char1}{host_switch_char2}\}".format(**hc_toggle)
                else:
                    line_data[3] = "[{host_switch_char1}{host_switch_char2}]".format(**hc_toggle)
            else:
                line_data[3] = ""
            fh_hc.write(":".join(line_data), end="\n")
    # TODO: Replace original HOST_CONFIG with our temporary one


@app.route("/log/<typ>", methods=["POST"])
def alda(typ=None):
    app.logger.debug("log-info: %s", typ)
    app.logger.debug(request.form)
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
    return make_response(data, {"Content-type": CONTENT_PLAIN})


def log_from_alda(typ):
    alda_output_format = {
        "input": "-o \"<tr><td class='clst-dd'>%ITm.%ITd.</td>"
                    +"<td class='clst-hh'>%ITH:%ITM:%ITS</td><td>%IF</td>"
                    +"<td class='clst-fs'>%OSB</td></tr>\"",
        "output": "-o \"<tr archive='|%OA/%xOZu_%xOU_%xOL_%Of|'>"
                    +"<td class='clst-dd'>%OTm.%OTd.</td><td class='clst-hh'>"
                    +"%OTH:%OTM:%OTS</td><td>%Of</td><td class='clst-hn'>%OH</td>"
                    +"<td class='clst-tr'>%OP</td><td class='clst-fs'>%OSB</td>"
                    +"<td class='clst-tt'>%ODA</td><td class='clst-aa'>|N|</td>"
                    +"</tr>\"",
        "delete": "-o \"<tr><td class='clst-dd'>%DTm.%DTd.</td>"
                    +"<td class='clst-hh'>%DTH:%DTM:%DTS</td><td>%DF</td>"
                    +"<td class='clst-fs'>%DSB</td><td class='clst-hn'>%DH</td>"
                    +"<td class='clst-rn'>%DR</td><td class='clst-pu'>%DW</td>"
                    +"</tr>\""
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
    return make_response(data, {"Content-type": CONTENT_PLAIN})


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
    if mode in ("hexdump", "od"):
        content_type = CONTENT_PLAIN
        content = exec_cmd(
            "bash -c \"hexdump -C {}\"".format(arcfile_path),
            True
            )
    elif mode == "bufr":
        content_type = CONTENT_HTML
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


def run():
    app.run()


if __name__ == "__main__":
    app.run()
