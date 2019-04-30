var AFDGUI = function() {
    return {
        rowNum : 0,
        urlBase : "http://localhost:4080/",
        urlCmd : {
            "state" : "fsa_view_json",
            "Enable/Disable host" : "afdcmd -X",
            "Info" : "get_hostname -h",
            "Configuration" : "get_dc_data -h",
        },
        markedRows : {},
        toggleMark : function(row) {
            if (this.markedRows[row.attr("id")]) {
                console.log("alias-click-deselect:", row.attr("id"));
                row.addClass("tabrow");
                row.removeClass("tabrow_mark");
                row.children(".mrkbl").removeClass("marked");
                row.children(".numval_mark").addClass("numval");
                row.children(".numval_mark").removeClass("numval_mark");
                delete this.markedRows[row.attr("id")];
            } else {
                console.log("alias-click-select:", row.attr("id"));
                row.addClass("tabrow_mark");
                row.removeClass("tabrow");
                row.children(".mrkbl").addClass("marked");
                row.children(".numval").addClass("numval_mark");
                row.children(".numval").removeClass("numval");
                this.markedRows[row.attr("id")] = true;
            }
        },
        evalMenu : function(menuItem) {
            // TODO auswerten, ob und wie menu-klick an afd_ctrl geht ...
            console.log("menu-click:", menuItem, Object.keys(this.markedRows));
            switch (menuItem) {
                case "Handle Event":
                    this.callAfdCtrl("event");
                    break;
                case "Start/Stop host":
                    this.callAliasToggle("afdcmd", [ "status_queue", "status_send", "status_retrieve" ], [
                            "PAUSE_QUEUE", "STOP_TRANSFER", "STOP_TRANSFER" ], "-t -q", "-T -Q", Object
                            .keys(this.markedRows));
                    break;
                case "Enable/Disable host":
                case "Debug: Debug":
                case "Info":
                case "Configuration":
                    this.callAliasCmd(AFDGUI.urlCmd[menuItem], Object.keys(this.markedRows));
                    break;
                case "System Log":
                case "Transfer Log":
                case "Input Log":
                case "Output Log":
                    window.open("afd-log.html");
                    break;
                // case "":
                // break;
                default:
                    ;
            }
        },

        callAfdCtrl : function(cmd) {
            console.log("callAfdCtrl:", cmd);
            // $.post(AFDGUI.urlBase + "cmd", "cmd="+cmd, function(a, b, c) {
            // return true;
            // });
            $.ajax({
                type : "GET",
                url : AFDGUI.urlBase + "cmd",
                data : cmd,
                complete : function(a, b) {
                    console.log(b);
                }
            });
        },
        callAliasToggle : function(cmd, lookFor, testFor, swon, swoff, aliasList) {
            console.log("callAliasToggle:", cmd, aliasList);
            var sw = "";
            $.each(aliasList, function(i, alias) {
                var testResult = false;
                for (var i = 0; i < lookFor.length; i++) {
                    testResult = testResult || $("#" + alias + " ." + lookFor[i]).hasClass(testFor[i]);
                }
                if (testResult == false) {
                    sw = swoff;
                } else {
                    sw = swon;
                }
                AFDGUI.callAfdCtrl(cmd + " " + sw + " " + alias.replace(/row_/, ""));
            });
        },
        callAliasCmd : function(cmd, aliasList) {
            if (aliasList.length == 0) {
                alert("erst markieren");
                return false;
            }
            console.log("callAliasCmd:", cmd, aliasList);
            $.each(aliasList, function(i, v) {
                this.callAfdCtrl(cmd + " " + v.replace(/row_/, ""));
            });
        },
        callAliasWindow : function(cmd, aliasList) {
            if (aliasList.length == 0) {
                alert("erst markieren");
                return false;
            }
            console.log("callAliasWindow:", cmd, aliasList);
            $.each(aliasList, function(i, v) {
                window.open(AFDGUI.urlBase + cmd + " " + v.replace(/row_/, ""));
            });
        },

        loadData : function() {
            $.getJSON(AFDGUI.urlBase + AFDGUI.urlCmd["state"], function(data) {
                this_data = data["data"];
                $.each(this_data, function(i, v) {
                    if ($("#row_" + v.alias).length == 0) {
                        AFDGUI.addRow(AFDGUI.rowNum, v);
                        AFDGUI.rowNum += 1;
                    }
                    AFDGUI.setRowData(v);
                });
            });
        },
        addRow : function(rowNum, val) {
            var row, val;
            row = $("#template_row").clone();
            $("#tbdy1").append(row);
            row.attr("rowNum", rowNum);
            row.attr("id", "row_" + val.alias);
            row.children(".alias").html(val.alias);
            row.show();
            row.removeAttr("style");
            row.on("click", function(event) {
                AFDGUI.toggleMark($(this));
            });
        },
        removeRow : function(rowAlias) {

        },
        setRowData : function(val) {
            var row, typ = null, j, x, y;
            row = $("#row_" + val.alias);
            for (typ in val) {
                if (!val.hasOwnProperty(typ)) {
                    next;
                }
                if (typ == "host_status") {
                    if (val.host_status.indexOf("HOST_IN_DIR_CONFIG") >= 0) {
                        if (val.host_status.indexOf("HOST_CONFIG_HOST_DISABLED") >= 0) {
                            row.children(".status_run").removeClass().addClass('status_run HOST_CONFIG_HOST_DISABLED');
                        } else if (val.host_status.indexOf("HOST_ERROR_OFFLINE") >= 0) {
                            row.children(".status_run").removeClass().addClass('status_run HOST_ERROR_OFFLINE');
                        } else if (val.host_status.indexOf("HOST_ERROR_ACKNOWLEDGED") >= 0) {
                            row.children(".status_run").removeClass().addClass('status_run HOST_ERROR_ACKNOWLEDGED');
                        } else if (val.host_status.indexOf("DANGER_PAUSE_QUEUE_STAT") >= 0) {
                            row.children(".status_run").removeClass().addClass('status_run DANGER_PAUSE_QUEUE_STAT');
                        } else if (val.host_status.indexOf("HOST_ERROR_OFFLINE_STATIC") >= 0) {
                            row.children(".status_run").removeClass().addClass('status_run HOST_ERROR_OFFLINE_STATIC');
                        } else if (val.host_status.indexOf("HOST_ACTION_SUCCESS") >= 0) {
                            row.children(".status_run").removeClass().addClass('status_run HOST_ACTION_SUCCESS');
                        } else if (val.host_status.indexOf("TRANSFER_ACTIVE") >= 0) {
                            row.children(".status_run").removeClass().addClass('status_run TRANSFER_ACTIVE');
                        } else if (val.host_status.indexOf("HOST_DISABLED") >= 0) {
                            row.children(".status_run").removeClass().addClass('status_run HOST_DISABLED');
                        } else if (val.host_status.indexOf("NORMAL_STATUS") >= 0) {
                            row.children(".status_run").removeClass().addClass('status_run NORMAL_STATUS');
                        }
                    } else { /* HOST_NOT_IN_DIR_CONFIG */
                        row.children(".status_run").removeClass().addClass('HOST_NOT_IN_DIR_CONFIG');
                    }
                    if (val.host_status.indexOf("PAUSE_QUEUE") >= 0) {
                        row.children(".status_queue").removeClass().addClass("status_led status_queue PAUSE_QUEUE");
                    } else if (val.host_status.indexOf("AUTO_PAUSE_QUEUE") >= 0) {
                        row.children(".status_queue").removeClass()
                                .addClass("status_led status_queue AUTO_PAUSE_QUEUE");
                    } else {
                        row.children(".status_queue").removeClass().addClass("status_led status_queue NORMAL_STATUS");
                    }
                    if (val.host_status.indexOf("STOP_TRANSFER") >= 0) {
                        if (val.direction.indexOf("S") >= 0) {
                            row.children(".status_send").removeClass().addClass("status_led status_send STOP_TRANSFER");
                        }
                        if (val.direction.indexOf("R") >= 0) {
                            row.children(".status_retrieve").removeClass().addClass(
                                    "status_led status_retrieve STOP_TRANSFER");
                        }
                    } else {
                        if (val.direction.indexOf("S") >= 0) {
                            row.children(".status_send").removeClass().addClass(
                                    "status_led status_send TRANSFER_NORMAL");
                        }
                        if (val.direction.indexOf("R") >= 0) {
                            row.children(".status_retrieve").removeClass().addClass(
                                    "status_led status_retrieve TRANSFER_NORMAL");
                        }
                    }
                } else if (typ == "debug_mode") {
                    var ctx = row.find(".debug_canvas").get(0).getContext("2d");
                    switch (val.debug_mode) {
                        case "debug":
                            ctx.fillStyle = "gold";
                            break;
                        case "trace":
                            ctx.fillStyle = "darkorange";
                            break;
                        case "full_trace":
                            ctx.fillStyle = "red";
                            break;
                        default:
                            ctx.fillStyle = "#d0f8ff";
                    }
                    ctx.fillRect(1, 1, 5, 5);
                } else if (typ == "direction") {
                    row.children(".status_send").removeClass().addClass("status_led status_send");
                    row.children(".status_retrieve").removeClass().addClass("status_led status_retrieve");
                    switch (val.direction) {
                        case "S":
                            row.children(".status_send").addClass("TRANSFER_NORMAL");
                            row.children(".status_retrieve").addClass("TRANSFER_DISABLED");
                            break;
                        case "R":
                            row.children(".status_send").addClass("TRANSFER_DISABLED");
                            row.children(".status_retrieve").addClass("TRANSFER_NORMAL");
                            break;
                        case "SR":
                            row.children(".status_send").addClass("TRANSFER_NORMAL");
                            row.children(".status_retrieve").addClass("TRANSFER_NORMAL");
                            break;
                        default:
                            row.children(".status_send").addClass("TRANSFER_DISABLED");
                            row.children(".status_retrieve").addClass("TRANSFER_DISABLED");
                            break;
                    }
                } else if (typ == "file_size") {
                    x = eval("val." + typ) + 0;
                    y = 'B';
                    if (x >= 1073741824) {
                        x %= 1073741824;
                        y = 'G';
                    }
                    if (x >= 1048576) {
                        x %= 1048576;
                        y = 'M';
                    }
                    if (x >= 1024) {
                        x %= 1024;
                        y = 'K';
                    }
                    row.children("." + typ).html(x + y);
                } else if (typ == "jobs") {
                    j = -1;
                    for (j in val.jobs) {
                        jid = row.attr("id") + "_job_" + val.jobs[j].job_num;
                        if ($("#" + jid).length == 0) {
                            radd = $("#template_job").clone();
                            radd.attr("id", jid);
                            row.children(".jobs").append(radd);
                            radd.show();
                        }
                        x = val.jobs[j].number_of_files;
                        if (x < 10) {
                            x = "0" + x;
                        }
                        y = val.jobs[j].connect_status.replace(/ /g, "_");
                        rmod = $("#" + jid);
                        rmod.removeClass().addClass(y);
                        rmod.html(x);
                    }
                } else {
                    row.children("." + typ).html(eval("val." + typ));
                }
            }
            // row.hide().show();
        } /* setRowData */
    };
}();

(function() {
    $(document).ready(function() {
        $("nav").find("a").not(".dropdown-toggle").click(function(event) {
            AFDGUI.evalMenu(event.target.text);
        });
        AFDGUI.loadData();

        setInterval(function() {
            AFDGUI.loadData();
        }, 5000);
    });
})();
