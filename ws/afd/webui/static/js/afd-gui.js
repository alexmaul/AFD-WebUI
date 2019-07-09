"use strict";
var AFDCTRL = function() {
    return {
        /** urlBase. */
        urlBase : "/",

        /** Interval [msec] for display update. */
        updateInterval : 3210,

        /** Initial number of alias rows. */
        rowNum : 0,

        /** Max. number of alias rows. */
        maxRowsPerCol : 40,

        /** Set of selected alias rows. */
        markedRows : {},

        /** Set max. number of rows for control-window host display. */
        setMaxRows : function(rows) {
            AFDCTRL.maxRowsPerCol = rows;
            AFDCTRL.rowNum = 0;
            console.log("new max rows:", AFDCTRL.maxRowsPerCol);
            $('.tabcol').remove();
        },

        /**
         * Select/deselect alias row.
         */
        toggleMark : function(row, how) {
            if (how <= 0 && this.markedRows[row.attr("id")]) {
                console.log("alias-click-deselect:", row.attr("id"));
                row.addClass("tab-row");
                row.removeClass("tab-row-mark");
                row.children(".mrkbl").removeClass("marked");
                row.children(".numval-mark").addClass("numval");
                row.children(".numval-mark").removeClass("numval-mark");
                delete this.markedRows[row.attr("id")];
            } else if (how >= 0) {
                console.log("alias-click-select:", row.attr("id"));
                row.addClass("tab-row-mark");
                row.removeClass("tab-row");
                row.children(".mrkbl").addClass("marked");
                row.children(".numval").addClass("numval-mark");
                row.children(".numval").removeClass("numval");
                this.markedRows[row.attr("id")] = true;
            }
        },

        /**
         * Join all hostnames from aliasList to comma-seperated string.
         */
        aliasCommaList : function(aliasList, prefix) {
            let aliasCommaList = "";
            $.each(aliasList, function(i, v) {
                if (i > 0) {
                    aliasCommaList += "," + v.replace(/row-/, "");
                } else if (prefix) {
                    aliasCommaList = "?" + v.replace(/row-/, "");
                } else {
                    aliasCommaList = v.replace(/row-/, "");
                }
            });
            return aliasCommaList;
        },

        bytes_to_human_str : function(bytes) {
            let factor = 'B';
            if (bytes >= 1073741824) {
                bytes = ~~(bytes/1073741824);
                factor = 'G';
            } else if (bytes >= 1048576) {
                bytes = ~~(bytes/1048576);
                factor = 'M';
            } else if (bytes >= 1024) {
                bytes = ~~(bytes/1024);
                factor = 'K';
            }
            return bytes + factor;
        },

        /**
         * Evaluate and deferr actions from menu selection.
         */
        evalMenu : function(menuItem) {
            console.log("menu-click:", menuItem, Object.keys(this.markedRows));
            switch (menuItem) {
                /*
                 * Menu: Host
                 */
                case "Handle Event":
                    AFDCTRL.callAfdCmd("event");
                    break;
                case "Start/Stop host":
                    AFDCTRL.callAliasToggle([ "status-queue", "status-send", "status-retrieve" ], [ "PAUSE_QUEUE",
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
                case "Search + (De)Select":
                    AFDCTRL.viewModalSelect(Object.keys(this.markedRows));
                    break;
                /*
                 * Menu: View
                 */
                case "Info":
                    AFDCTRL.viewModalInfo(Object.keys(this.markedRows));
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
                    window.open("/static/html/afd-log.html"
                            + AFDCTRL.aliasCommaList(Object.keys(this.markedRows), true) + "#input");
                    break;
                case "Output Log":
                    window.open("/static/html/afd-log.html"
                            + AFDCTRL.aliasCommaList(Object.keys(this.markedRows), true) + "#output");
                    break;
                case "Delete Log":
                    window.open("/static/html/afd-log.html"
                            + AFDCTRL.aliasCommaList(Object.keys(this.markedRows), true) + "#delete");
                    break;
                case "Queue":
                    window.open("/static/html/afd-log.html"
                            + AFDCTRL.aliasCommaList(Object.keys(this.markedRows), true) + "#queue");
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
                    window.open("/static/html/afd-hcedit.html"
                            + AFDCTRL.aliasCommaList(Object.keys(this.markedRows), true));
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
                case "Refresh":
                    AFDCTRL.setMaxRows(AFDCTRL.maxRowsPerCol);
                    break;
                default:
                    break;
            }
        },
        /*
         * ====================================================================
         * Methods building and sending commands to AFD.
         */
        /**
         * Exec general AFD command, handle ajax call.
         */
        callAfdCmd : function(cmd) {
            console.log("callAfdCmd:", cmd);
            $.ajax({
                type : "POST",
                url : AFDCTRL.urlBase + "afd/" + cmd,
                complete : function(a, b) {
                    console.log(b);
                }
            });
        },
        /**
         * Decide and exec command for selected alias.
         * 
         * Decission is made by testing if any of the nodes with ID from lookFor
         * has the corresponding class from testFor.
         */
        callAliasToggle : function(lookFor, testFor, swon, swoff, aliasList) {
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

        /**
         * Exec command for selected alias.
         * 
         * Expects empty response (http 204).
         */
        callAliasCmd : function(cmd, aliasList) {
            if (!AFDCTRL.isAliasSelected(aliasList)) {
                return;
            }
            console.log("callAliasCmd:", cmd, aliasList);
            let aliasCommaList = AFDCTRL.aliasCommaList(aliasList, false);
            $.ajax({
                type : "POST",
                url : AFDCTRL.urlBase + "alias/" + cmd,
                data : {
                    alias : aliasCommaList
                },
                complete : function(a, b) {
                    console.log(b);
                }
            });
        },

        /**
         * Open new window with command response.
         * 
         * Best suited for e.g. alias configuration.
         */
        callAliasWindow : function(cmd, aliasList) {
            if (!AFDCTRL.isAliasSelected(aliasList)) {
                return;
            }
            console.log("callAliasWindow:", cmd, aliasList);
            $.each(aliasList, function(i, v) {
                window.open(AFDCTRL.urlBase + "alias/" + cmd + "/" + v.replace(/row-/, ""));
            });
        },

        /**
         * Test if any alias is selected, popup alert if not.
         */
        isAliasSelected : function(aliasList) {
            if (aliasList.length == 0) {
                alert("You must first select a host!");
                return false;
            }
            return true;
        },

        /*
         * ====================================================================
         * Methods for load/save host information (INFO-files).
         */
        /**
         * Retrieve host information (incl. INFO-file) for all hosts in
         * aliasList.
         */
        viewModalInfo : function(aliasList) {
            console.log("viewModalInfo:", aliasList);
            if (!AFDCTRL.isAliasSelected(aliasList)) {
                return;
            }
            $.each(aliasList, function(i, v) {
                let aliasName = v.replace(/row-/, "");
                $.ajax({
                    type : "GET",
                    url : AFDCTRL.urlBase + "alias/info/" + aliasName,
                    success : function(data, status, jqxhr) {
                        console.log(status, jqxhr);
                        $("#modalInfoBody").append(data);
                    }
                });
            });
            $("#modalInfo").modal("show");
        },

        /**
         * Remove host info from modal. Close modal if removing last info.
         */
        closeInfo : function(infoHost) {
            console.log("closeInfo:", infoHost);
            $("#infoBox_" + infoHost).remove();
            if ($("#modalInfoBody").children().length == 0) {
                $("#modalInfo").modal("hide");
            } else {
                $("#modalInfo").modal("handleUpdate");
            }
        },

        /**
         * Send POST to save edited text in INFO-file.
         */
        saveInfoText : function(infoHost) {
            console.log("saveInfoText");
            let infoText = $("#infoArea_" + infoHost)[0];
            console.log(infoHost);
            console.log(infoText.value);
            $.ajax({
                type : "POST",
                url : AFDCTRL.urlBase + "alias/info/" + infoHost,
                data : {
                    text : infoText.value
                },
                complete : function(a, b) {
                    console.log(b);
                }
            });
        },

        /*
         * ====================================================================
         * Methods for de-/select hosts.
         */
        /**
         * Show modal dialog for host selection.
         */
        viewModalSelect : function(aliasList) {
            console.log("viewModalSelect:", aliasList);
            $("#modalSelect").modal("show");
        },

        /**
         * Close modal dialog.
         */
        closeModalSelect : function(infoHost) {
            console.log("closeModalSelect:", infoHost);
            $("#modalSelect").modal("hide");
        },

        /**
         * Send selection criteria with POST, select or de-select alias rows
         * according the returned list.
         */
        callAliasSelect : function(cmd) {
            console.log("callAliasSelect:");
            /* Declare and collect form parameters. */
            let paramSet = {
                what : cmd
            };
            $.each($("#modalSelect .filter"), function(i, obj) {
                if (obj.type == "checkbox" || obj.type == "radio") {
                    /* Make lists for checkbox+radio values. */
                    if (obj.checked == true) {
                        if (paramSet[obj.name] == null) {
                            paramSet[obj.name] = [];
                        }
                        paramSet[obj.name].push(obj.value);
                    }
                } else if (obj.value != "") {
                    paramSet[obj.name] = obj.value;
                }
            });
            /* Call REST with parameter ... */
            $.ajax({
                type : "POST",
                url : AFDCTRL.urlBase + "alias/" + cmd,
                dataType : 'JSON',
                data : JSON.stringify(paramSet),
                contentType : "application/json; charset=utf-8",
                traditional : true,
                success : function(data, status, jqxhr) {
                    console.log(status, data);
                    /* ... then select+deselect all hosts in returned lists. */
                    $.each(data["select"], function(i, v) {
                        let row = $("#row-" + v);
                        AFDCTRL.toggleMark(row, 1);
                    });
                    $.each(data["deselect"], function(i, v) {
                        let row = $("#row-" + v);
                        AFDCTRL.toggleMark(row, -1);
                    });
                },
                error : function(status, jqxhr) {
                    console.log(status, jqxhr);
                },
            });
        },

        /*
         * ====================================================================
         * Methods to load data and update display.
         */
        /**
         * Load FSA data and start update on all aliases in afd_ctrl-window.
         * 
         * TODO: improve insert/remove of rows. Now rows are inserted/removed
         * with simple append/remove, changes in host-order are not reflected.
         */
        loadData : function() {
            $.getJSON(AFDCTRL.urlBase + "fsa/json", function(data) {
                if (data["data"].length < AFDCTRL.rowNum) {
                    let dataAliasSet = {};
                    $.each(data["data"], function(i, v) {
                        dataAliasSet["row-" + v.alias] = v.ord;
                    });
                    $.each($(".tab-row"), function(i, o) {
                        if (o.id != "template-row") {
                            if (dataAliasSet[o.id] == undefined) {
                                AFDCTRL.removeRow(o.id);
                            }
                        }
                    });
                }
                $.each(data["data"], function(i, v) {
                    if ($("#row-" + v.alias).length == 0) {
                        AFDCTRL.addRow(AFDCTRL.rowNum, v);
                        AFDCTRL.rowNum += 1;
                    }
                    AFDCTRL.setRowData(v);
                });
            });
        },

        /**
         * Insert new alias row if yet not present in afd_ctrl-window.
         */
        addRow : function(rowNum, val) {
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
                AFDCTRL.toggleMark($(this), 0);
            });
            $("#tbdy-" + lastCol).append(row);
        },

        /**
         * Remove alias row from afd_ctrl-window.
         */
        removeRow : function(rowAlias) {
            $("#" + rowAlias).remove();
            AFDCTRL.rowNum -= 1;
        },

        /**
         * Update all changed data in an alias row.
         */
        setRowData : function(val) {
            let key = null, j, jid, x, y, radd, rmod;
            let row = $("#row-" + val.alias);
            for (key in val) {
                if (key == "host_status") {
                    if (val.host_status.indexOf("HOST_IN_DIR_CONFIG") >= 0) {
                        let status_str = "";
                        if (val.host_status.indexOf("HOST_CONFIG_HOST_DISABLED") >= 0) {
                            status_str = "HOST_CONFIG_HOST_DISABLED";
                        } else if (val.host_status.indexOf("HOST_ERROR_OFFLINE") >= 0) {
                            if (val.host_status.indexOf("HOST_ERROR_OFFLINE_STATIC") >= 0) {
                                status_str = "HOST_ERROR_OFFLINE_STATIC";
                            } else {
                                status_str = "HOST_ERROR_OFFLINE";
                            }
                        } else if (val.host_status.indexOf("HOST_ERROR_ACKNOWLEDGED") >= 0) {
                            status_str = "HOST_ERROR_ACKNOWLEDGED";
                        } else if (val.host_status.indexOf("DANGER_PAUSE_QUEUE_STAT") >= 0) {
                            status_str = "DANGER_PAUSE_QUEUE_STAT";
                        } else if (val.host_status.indexOf("HOST_ACTION_SUCCESS") >= 0) {
                            status_str = "HOST_ACTION_SUCCESS";
                        } else if (val.host_status.indexOf("TRANSFER_ACTIVE") >= 0) {
                            status_str = "TRANSFER_ACTIVE";
                        } else if (val.host_status.indexOf("HOST_DISABLED") >= 0) {
                            status_str = "HOST_DISABLED";
                        } else if (val.host_status.indexOf("NORMAL_STATUS") >= 0) {
                            status_str = "NORMAL_STATUS";
                        }
                        if (!row.children(".status-run").hasClass(status_str)){
                            row.children(".status-run").removeClass().addClass("alias status-run " + status_str);
                        }
                    } else { /* HOST_NOT_IN_DIR_CONFIG */
                        row.children(".status-run").removeClass().addClass("alias status-run HOST_NOT_IN_DIR_CONFIG");
                    }
                    if (val.host_status.indexOf("PAUSE_QUEUE") >= 0) {
                        row.children(".status-queue").removeClass().addClass("status-led status-queue PAUSE_QUEUE");
                    } else if (val.host_status.indexOf("AUTO_PAUSE_QUEUE") >= 0) {
                        row.children(".status-queue").removeClass()
                                .addClass("status-led status-queue AUTO_PAUSE_QUEUE");
                    } else {
                        row.children(".status-queue").removeClass().addClass("status-led status-queue NORMAL_STATUS");
                    }
                } else if (key == "debug_mode") {
                    let ctx = row.find(".debug-canvas").get(0).getContext("2d");
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
                } else if (key == "direction") {
                    let status_transfer;
                    if (val.host_status.indexOf("STOP_TRANSFER") >= 0) {
                        status_transfer="STOP_TRANSFER";
                    } else {
                        status_transfer="TRANSFER_NORMAL";
                    }
                    row.children(".status-send").removeClass().addClass("status-led status-send");
                    row.children(".status-retrieve").removeClass().addClass("status-led status-retrieve");
                    switch (val.direction) {
                        case "S":
                            row.children(".status-send").addClass(status_transfer);
                            row.children(".status-retrieve").addClass("TRANSFER_DISABLED");
                            break;
                        case "R":
                            row.children(".status-send").addClass("TRANSFER_DISABLED");
                            row.children(".status-retrieve").addClass(status_transfer);
                            break;
                        case "SR":
                            row.children(".status-send").addClass(status_transfer);
                            row.children(".status-retrieve").addClass(status_transfer);
                            break;
                        default:
                            row.children(".status-send").addClass("TRANSFER_DISABLED");
                            row.children(".status-retrieve").addClass("TRANSFER_DISABLED");
                            break;
                    }
                } else if (key == "file_size") {
                    row.children(".file_size").html(
                            AFDCTRL.bytes_to_human_str(val.file_size)
                    );
                } else if (key == "bytes_send") {
                    let ftr = row.children(".transfer_rate").first();
                    if (ftr.attr("bytes_send") == null) {
                        ftr.attr("bytes_send", val.bytes_send);
                    }
                    row.children(".transfer_rate").html(
                            AFDCTRL.bytes_to_human_str(
                                    (val.bytes_send - ftr.attr("bytes_send")) / (AFDCTRL.updateInterval/1000)
                            )
                    );
                    ftr.attr("bytes_send", val.bytes_send);
                } else if (key == "jobs") {
                    j = -1;
                    for (j in val.jobs) {
                        jid = row.attr("id") + "_job_" + val.jobs[j].job_num;
                        if ($("#" + jid).length == 0) {
                            radd = $("#template-job").clone();
                            radd.attr("id", jid);
                            row.children(".jobs").append(radd);
                            radd.show();
                        }
                        x = val.jobs[j].number_of_files - val.jobs[j].number_of_files_done;
                        if (x < 10) {
                            x = "0" + x;
                        }
                        y = val.jobs[j].connect_status.replace(/ /g, "_");
                        rmod = $("#" + jid);
                        rmod.removeClass().addClass(y);
                        rmod.html(x);
                    }
                } else {
                    row.children("." + key).html(eval("val." + key));
                }
            }
        } /* setRowData */
    }; /* End returned object. */
}();

(function() {
    $(document).ready(function() {
        /*
         * Set height for host area.
         */
        let tabAreaHeight = $(window).innerHeight() - $("#navbarArea").innerHeight() - 40;
        $("#tab-area").attr("style", "height:" + tabAreaHeight + "px;");
        /*
         * Set event-handler for navbar menu.
         */
        $("nav").find("a").not(".dropdown-toggle").click(function(event) {
            AFDCTRL.evalMenu(event.target.text);
        });
        /*
         * Set update function for modal events.
         */
        $("#modalInfo").on("hide.bs.modal", function(event) {
            console.log("clear modalInfoBody");
            $("#modalInfoBody").children().remove();
        });
        /*
         * Initial load data.
         */
        AFDCTRL.loadData();
        /*
         * Set interval-handler to regularly load data and update display.
         */
        setInterval(function() {
            AFDCTRL.loadData();
        }, AFDCTRL.updateInterval);
    });
})();
