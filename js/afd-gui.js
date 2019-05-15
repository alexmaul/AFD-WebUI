var AFDCTRL = function() {
    return {
        urlBase : "/",
        rowNum : 0, // Initial nomber of alias rows.
        maxRowsPerCol : 40, // Max. number of alias rows.
        markedRows : {}, // Set of selected alias rows.
        toggleMark : function(row) {
            /*
             * Select/deselect alias row.
             */
            if (this.markedRows[row.attr("id")]) {
                console.log("alias-click-deselect:", row.attr("id"));
                row.addClass("tab-row");
                row.removeClass("tab-row-mark");
                row.children(".mrkbl").removeClass("marked");
                row.children(".numval-mark").addClass("numval");
                row.children(".numval-mark").removeClass("numval-mark");
                delete this.markedRows[row.attr("id")];
            } else {
                console.log("alias-click-select:", row.attr("id"));
                row.addClass("tab-row-mark");
                row.removeClass("tab-row");
                row.children(".mrkbl").addClass("marked");
                row.children(".numval").addClass("numval-mark");
                row.children(".numval").removeClass("numval");
                this.markedRows[row.attr("id")] = true;
            }
        },
        setMaxRows : function(rows) {
            AFDCTRL.maxRowsPerCol = rows;
            AFDCTRL.rowNum = 0;
            console.log("new max rows:", AFDCTRL.maxRowsPerCol);
            $('.tabcol').remove();
        },
        evalMenu : function(menuItem) {
            /*
             * Evaluate and deferr actions from menu selection.
             */
            console.log("menu-click:", menuItem, Object.keys(this.markedRows));
            switch (menuItem) {
                /*
                 * Menu: Host
                 */
                case "Handle Event":
                    AFDCTRL.callAfdCmd("event");
                    break;
                case "Start/Stop host":
                    AFDCTRL.callAliasToggle([ "status_queue", "status_send", "status_retrieve" ], [ "PAUSE_QUEUE",
                            "STOP_TRANSFER", "STOP_TRANSFER" ], "start", "stop", Object.keys(this.markedRows));
                    break;
                case "Enable/Disable host":
                    AFDCTRL.callAliasCmd("able", Object.keys(this.markedRows));
                    break;
                case "Debug: Debug":
                    AFDCTRL.callAliasCmd("debug", Object.keys(this.markedRows));
                    break;
                case "Debug: Trace":
                    AFDCTRL.callAliasCmd("trace", Object.keys(this.markedRows));
                    break;
                case "Debug: Full trace":
                    AFDCTRL.callAliasCmd("fulltrace", Object.keys(this.markedRows));
                    break;
                case "Switch host":
                    AFDCTRL.callAliasCmd("switch", Object.keys(this.markedRows));
                    break;
                case "Retry":
                    AFDCTRL.callAliasCmd("retry", Object.keys(this.markedRows));
                    break;
                /*
                 * Menu: View
                 */
                case "Info":
                    AFDCTRL.callAliasWindow("info", Object.keys(this.markedRows));
                    break;
                case "Configuration":
                    AFDCTRL.callAliasWindow("config", Object.keys(this.markedRows));
                    break;
                case "System Log":
                    window.open("/static/html/afd-log.html#system");
                    break;
                case "Receive Log":
                    window.open("/static/html/afd-log.html#receive");
                    break;
                case "Transfer Log":
                    window.open("/static/html/afd-log.html#transfer");
                    break;
                case "Transfer Debug Log":
                    window.open("/static/html/afd-log.html#transfer-debug");
                    break;
                case "Input Log":
                    window.open("/static/html/afd-log.html#input");
                    break;
                case "Output Log":
                    window.open("/static/html/afd-log.html#output");
                    break;
                case "Delete Log":
                    window.open("/static/html/afd-log.html#delete");
                    break;
                case "Queue":
                    window.open("/static/html/afd-log.html#queue");
                    break;
                /*
                 * Menu: Control
                 */
                case "Start/Stop AMG":
                    AFDCTRL.callAfdCmd("amg/toggle");
                    break;
                case "Start/Stop FD":
                    AFDCTRL.callAfdCmd("fd/toggle");
                    break;
                case "Reread DIR_CONFIG":
                    AFDCTRL.callAfdCmd("dc/update");
                    break;
                case "Reread HOST_CONFIG":
                    AFDCTRL.callAfdCmd("hc/update");
                    break;
                case "Edit HOST_CONFIG":
                    window.open("/static/html/afd-hcedit.html");
                    break;
                case "Startup AFD":
                    AFDCTRL.callAfdCmd("afd/start");
                    break;
                case "Shutdown AFD":
                    AFDCTRL.callAfdCmd("afd/stop");
                    break;
                /*
                 * Menu: Setup
                 */
                // case "":
                // break;
                default:
                    break;
            }
        },
        /***********************************************************************
         * Methods building and sending commands to AFD.
         */
        callAfdCmd : function(cmd) {
            /*
             * Exec general AFD command, handle ajax call.
             */
            console.log("callAfdCmd:", cmd);
            $.ajax({
                type : "GET",
                url : AFDCTRL.urlBase + "afd/" + cmd,
                complete : function(a, b) {
                    console.log(b);
                }
            });
        },
        callAliasToggle : function(lookFor, testFor, swon, swoff, aliasList) {
            /*
             * Decide and exec command for selected alias.
             * 
             * Decission is made by testing if any of the nodes with ID from
             * lookFor has the corresponding class from testFor.
             */
            if (!AFDCTRL.isAliasSelected(aliasList)) {
                return;
            }
            console.log("callAliasToggle:", swon, swoff, aliasList);
            let sw = "";
            $.each(aliasList, function(i, alias) {
                let testResult = false;
                for (let i = 0; i < lookFor.length; i++) {
                    testResult = testResult || $("#" + alias + " ." + lookFor[i]).hasClass(testFor[i]);
                }
                if (testResult == false) {
                    sw = swoff;
                } else {
                    sw = swon;
                }
                AFDCTRL.callAliasCmd(sw, [ alias ]);
            });
        },
        callAliasCmd : function(cmd, aliasList) {
            /*
             * Exec command for selected alias.
             * 
             * Expects empty response (http 204).
             */
            if (!AFDCTRL.isAliasSelected(aliasList)) {
                return;
            }
            console.log("callAliasCmd:", cmd, aliasList);
            alias_cl = ""
            $.each(aliasList, function(i, v) {
                if (i > 0) {
                    alias_cl += "," + v.replace(/row-/, "")
                } else {
                    alias_cl = v.replace(/row-/, "")
                }
            });
            $.ajax({
                type : "POST",
                url : AFDCTRL.urlBase + "alias/" + cmd,
                data : {
                    alias : alias_cl
                },
                complete : function(a, b) {
                    console.log(b);
                }
            });
        },
        callAliasWindow : function(cmd, aliasList) {
            /*
             * Open new window with command response.
             * 
             * Best suited for e.g. alias configuration.
             */
            if (!AFDCTRL.isAliasSelected(aliasList)) {
                return;
            }
            console.log("callAliasWindow:", cmd, aliasList);
            $.each(aliasList, function(i, v) {
                window.open(AFDCTRL.urlBase + "alias/" + cmd + "/" + v.replace(/row-/, ""));
            });
        },
        isAliasSelected : function(aliasList) {
            /*
             * Test if any alias is selected, popup alert if not.
             */
            if (aliasList.length == 0) {
                alert("You must first select a host!");
                return false;
            }
            return true;
        },
        /***********************************************************************
         * Methods to load data and update display.
         */
        loadData : function() {
            /*
             * 
             */
            $.getJSON(AFDCTRL.urlBase + "fsa/json", function(data) {
                this_data = data["data"];
                $.each(this_data, function(i, v) {
                    if ($("#row-" + v.alias).length == 0) {
                        AFDCTRL.addRow(AFDCTRL.rowNum, v);
                        AFDCTRL.rowNum += 1;
                    }
                    AFDCTRL.setRowData(v);
                });
            });
        },
        addRow : function(rowNum, val) {
            /*
             * 
             */

            let lastCol = Math.floor(rowNum / AFDCTRL.maxRowsPerCol);
            console.log("rownum:", rowNum, "maxRowsPerCol:", AFDCTRL.maxRowsPerCol, "lastCol:", lastCol, "tabcol.len:",
                    $(".tabcol").length);
            if ($(".tabcol").length <= lastCol) {
                let col = $("#template-tabcol").clone();
                col.attr("id", "tabcol-" + lastCol);
                col.addClass("tabcol");
                col.removeAttr("style");
                col.find("tbody").attr("id", "tbdy-" + lastCol);
                $("#tab-area").append(col);
            }
            let row = $("#template-row").clone();
            row.attr("rowNum", rowNum);
            row.attr("id", "row-" + val.alias);
            row.children(".alias").html(val.alias);
            row.show();
            row.removeAttr("style");
            row.on("click", function(event) {
                AFDCTRL.toggleMark($(this));
            });
            $("#tbdy-" + lastCol).append(row);
        },
        removeRow : function(rowAlias) {

        },
        setRowData : function(val) {
            /*
             * 
             */
            let typ = null, j, x, y;
            let row = $("#row-" + val.alias);
            for (typ in val) {
                if (!val.hasOwnProperty(typ)) {
                    next;
                }
                if (typ == "host_status") {
                    if (val.host_status.indexOf("HOST_IN_DIR_CONFIG") >= 0) {
                        if (val.host_status.indexOf("HOST_CONFIG_HOST_DISABLED") >= 0) {
                            row.children(".status_run").removeClass().addClass(
                                    "alias status_run HOST_CONFIG_HOST_DISABLED");
                        } else if (val.host_status.indexOf("HOST_ERROR_OFFLINE") >= 0) {
                            row.children(".status_run").removeClass().addClass("alias status_run HOST_ERROR_OFFLINE");
                        } else if (val.host_status.indexOf("HOST_ERROR_ACKNOWLEDGED") >= 0) {
                            row.children(".status_run").removeClass().addClass(
                                    "alias status_run HOST_ERROR_ACKNOWLEDGED");
                        } else if (val.host_status.indexOf("DANGER_PAUSE_QUEUE_STAT") >= 0) {
                            row.children(".status_run").removeClass().addClass(
                                    "alias status_run DANGER_PAUSE_QUEUE_STAT");
                        } else if (val.host_status.indexOf("HOST_ERROR_OFFLINE_STATIC") >= 0) {
                            row.children(".status_run").removeClass().addClass(
                                    "alias status_run HOST_ERROR_OFFLINE_STATIC");
                        } else if (val.host_status.indexOf("HOST_ACTION_SUCCESS") >= 0) {
                            row.children(".status_run").removeClass().addClass("alias status_run HOST_ACTION_SUCCESS");
                        } else if (val.host_status.indexOf("TRANSFER_ACTIVE") >= 0) {
                            row.children(".status_run").removeClass().addClass("alias status_run TRANSFER_ACTIVE");
                        } else if (val.host_status.indexOf("HOST_DISABLED") >= 0) {
                            row.children(".status_run").removeClass().addClass("alias status_run HOST_DISABLED");
                        } else if (val.host_status.indexOf("NORMAL_STATUS") >= 0) {
                            row.children(".status_run").removeClass().addClass("alias status_run NORMAL_STATUS");
                        }
                    } else { /* HOST_NOT_IN_DIR_CONFIG */
                        row.children(".status_run").removeClass().addClass("HOST_NOT_IN_DIR_CONFIG");
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
                    let ctx = row.find(".debug_canvas").get(0).getContext("2d");
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
                            radd = $("#template-job").clone();
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
        } /* setRowData */
    };
}();

(function() {
    $(document).ready(function() {
        /* Set height for host area. */
        let tab_area_height = $(window).innerHeight() - $("#navbarArea").innerHeight() - 40;
        $("#tab-area").attr("style", "height:" + tab_area_height + "px;");
        /* Set event-handler for navbar menu. */
        $("nav").find("a").not(".dropdown-toggle").click(function(event) {
            AFDCTRL.evalMenu(event.target.text);
        });
        /* Initial load data. */
        AFDCTRL.loadData();
        /* Set interval-handler to regularly load data and update display. */
        setInterval(function() {
            AFDCTRL.loadData();
        }, 5000);
    });
})();
