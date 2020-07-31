"use strict";

var AFDUI = function() {
	/*
	 * THE global object.
	 */
	return {
		/** Websocket protocol scheme. */
		urlWsProto: "ws:",

		/** Protocol scheme for view-content. */
		urlViewProto: "http:",

		/** urlBase. */
		urlBase: "localhost:8040",

		/** urlPathLog. */
		urlPathLog: "/ui/html/afd-log.html",

		/** urlPathEdit. */
		urlPathHcEdit: "/ui/html/afd-hcedit.html",

		/** Interval [msec] for heartbeat and re-connect delay. */
		heartbeatInterval: 10000,

		updateUrlGlobals: function() {
			if (window.location.protocol === "https:") {
				AFDUI.urlWsProto = "wss:";
				AFDUI.urlViewProto = "https:";
			}
			AFDUI.urlBase = window.location.host;
		}
	};
}();

var AFDCTRL = function() {
	return {
		/** Initial number of alias rows. */
		rowNum: 0,

		/** Max. number of alias rows. */
		maxRowsPerCol: 40,

		/** Set of selected alias rows. */
		markedRows: {},

		/** Hold Websocket connection. */
		ws: {},
		reconnectInterval: null,

		/** Set max. number of rows for control-window host display. */
		setMaxRows: function(rows) {
			AFDCTRL.maxRowsPerCol = rows;
			AFDCTRL.rowNum = 0;
			console.log("new max rows:", AFDCTRL.maxRowsPerCol);
			/* Removing existing column causes re-build of display. */
			$('.tabcol').remove();
		},

        /**
         * Select/deselect alias row.
         * 
         * how: -1 = only deselect, 1 = select, 0 = toggle selection.
         */
		toggleMark: function(row, how) {
			if (how <= 0 && this.markedRows[row.attr("id")]) {
				console.debug("alias-click-deselect:", row.attr("id"));
				row.addClass("tab-row");
				row.removeClass("tab-row-mark");
				row.children(".mrkbl").removeClass("marked");
				row.children(".numval-mark").addClass("numval");
				row.children(".numval-mark").removeClass("numval-mark");
				delete this.markedRows[row.attr("id")];
			} else if (how >= 0) {
				console.debug("alias-click-select:", row.attr("id"));
				row.addClass("tab-row-mark");
				row.removeClass("tab-row");
				row.children(".mrkbl").addClass("marked");
				row.children(".numval").addClass("numval-mark");
				row.children(".numval").removeClass("numval");
				this.markedRows[row.attr("id")] = true;
			}
		},

        /**
         * Show or hide modal with selection form.
         */
		toggleModal: function(modal) {
			$.each($("#" + modal + " input.form-check-input"), function(i, obj) {
				if (obj.checked == true) {
					obj.checked = false;
				} else {
					obj.checked = true;
				}
			});
		},

        /**
         * Join all hostnames from aliasList to comma-seperated string.
         * 
         * prefix==true: a "?" is prepended for using the list as GET parameter.
         */
		aliasCommaList: function(aliasList, prefix) {
			let aliasCommaList;
			aliasCommaList = "";
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

        /**
         * Make value more human-readable.
         * 
         * Reduce numeric value by some factor and add letter B/K/M/G.
         */
		bytes_to_human_str: function(bytes) {
			let factor;
			factor = 'B';
			if (bytes >= 1073741824) {
				/* The bit-operation "~~" truncates to unsigned integer. */
				bytes = ~~(bytes / 1073741824);
				factor = 'G';
			} else if (bytes >= 1048576) {
				bytes = ~~(bytes / 1048576);
				factor = 'M';
			} else if (bytes >= 1024) {
				bytes = ~~(bytes / 1024);
				factor = 'K';
			}
			return bytes + factor;
		},

        /**
         * Evaluate and deferr actions from menu selection.
         */
		evalMenu: function(menuItem) {
			console.debug("menu-click:", menuItem, Object.keys(this.markedRows));
			switch (menuItem) {
                /*
                 * Menu: Host
                 */
				case "Handle Event":
					AFDCTRL.ajaxCallAfdCmd("event");
					break;
				case "Start/Stop host":
					AFDCTRL.callAliasToggle(["status-queue", "status-send", "status-retrieve"], ["PAUSE_QUEUE",
						"STOP_TRANSFER", "STOP_TRANSFER"], "start", "stop", Object.keys(this.markedRows));
					break;
				case "Enable/Disable host":
					AFDCTRL.wsCallAliasCmd("able", Object.keys(this.markedRows));
					break;
				case "Debug: Debug":
					AFDCTRL.wsCallAliasCmd("debug", Object.keys(this.markedRows));
					break;
				case "Debug: Trace":
					AFDCTRL.wsCallAliasCmd("trace", Object.keys(this.markedRows));
					break;
				case "Debug: Full trace":
					AFDCTRL.wsCallAliasCmd("fulltrace", Object.keys(this.markedRows));
					break;
				case "Switch host":
					AFDCTRL.wsCallAliasCmd("switch", Object.keys(this.markedRows));
					break;
				case "Retry":
					AFDCTRL.wsCallAliasCmd("retry", Object.keys(this.markedRows));
					break;
				case "Search + (De)Select":
					AFDCTRL.viewModalSelect(Object.keys(this.markedRows));
					break;
                /*
                 * Menu: View
                 */
				case "Info":
					AFDCTRL.wsViewModalHostInfo(Object.keys(this.markedRows));
					break;
				case "Configuration":
					console.log("callAliasWindow:", "config", Object.keys(this.markedRows));
					AFDCTRL.wsCallAliasCmd("config", Object.keys(this.markedRows));
					break;
				case "System Log":
					window.open(AFDUI.urlPathLog + "#system");
					break;
				case "Receive Log":
					window.open(AFDUI.urlPathLog + "#receive");
					break;
				case "Transfer Log":
					window.open(AFDUI.urlPathLog + "#transfer");
					break;
				case "Transfer Debug Log":
					window.open(AFDUI.urlPathLog + "#transfer-debug");
					break;
				case "Input Log":
					window.open(AFDUI.urlPathLog
						+ AFDCTRL.aliasCommaList(Object.keys(this.markedRows), true) + "#input");
					break;
				case "Output Log":
					window.open(AFDUI.urlPathLog
						+ AFDCTRL.aliasCommaList(Object.keys(this.markedRows), true) + "#output");
					break;
				case "Delete Log":
					window.open(AFDUI.urlPathLog
						+ AFDCTRL.aliasCommaList(Object.keys(this.markedRows), true) + "#delete");
					break;
				case "Queue":
					window.open(AFDUI.urlPathLog
						+ AFDCTRL.aliasCommaList(Object.keys(this.markedRows), true) + "#queue");
					break;
                /*
                 * Menu: Control
                 */
				case "Start/Stop AMG":
					AFDCTRL.wsCallAfdCmd("amg", "toggle");
					break;
				case "Start/Stop FD":
					AFDCTRL.wsCallAfdCmd("fd", "toggle");
					break;
				case "Reread DIR_CONFIG":
					AFDCTRL.wsCallAfdCmd("dc", "update");
					break;
				case "Reread HOST_CONFIG":
					AFDCTRL.wsCallAfdCmd("hc", "update");
					break;
				case "Edit HOST_CONFIG":
					window.open(AFDUI.urlPathHcEdit
						+ AFDCTRL.aliasCommaList(Object.keys(this.markedRows), true));
					break;
				case "Startup AFD":
					AFDCTRL.wsCallAfdCmd("afd", "start");
					break;
				case "Shutdown AFD":
					AFDCTRL.wsCallAfdCmd("afd", "stop");
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
         * Handle Websocket communication with AFD.
         */
		/**
         * 
         */
		wsConnectionOpen: function() {
			AFDCTRL.ws = new WebSocket(
				AFDUI.urlWsProto + "//" + AFDUI.urlBase + "/ctrl",
				["json"]
			);
			AFDCTRL.ws.addEventListener("open", function() {
				setTimeout(function() { AFDCTRL.wsConnectionHeartbeat() }, AFDUI.heartbeatInterval);
				if (AFDCTRL.reconnectInterval !== null) {
					clearInterval(AFDCTRL.reconnectInterval);
					AFDCTRL.reconnectInterval = null;
				}
				const message = {
					user: "test",
					class: "fsa",
					command: "fsa",
					action: "start"
				};
				AFDCTRL.ws.send(JSON.stringify(message));
			});
			AFDCTRL.ws.addEventListener("close", function(event) {
				console.warn(event.code, event.reason);
				clearTimeout(AFDCTRL.ws.pingTimeout);
				AFDCTRL.wsConnectionReconnect();
			});
			AFDCTRL.ws.addEventListener("ping", AFDCTRL.wsConnectionHeartbeat
			);
			AFDCTRL.ws.addEventListener("error", function(event) {
			});
			AFDCTRL.ws.addEventListener("message", function(event) {
				AFDCTRL.wsConnectionHeartbeat();
				const message = JSON.parse(event.data);
				console.debug(message);
				/* evaluate incoming message */
				switch (message.class) {
					case "fsa":
						AFDCTRL.wsLoadData(message.data);
						break;
					case "alias":
						switch (message.action) {
							case "config":
								AFDCTRL.openWindowPlaintext(message.alias[0], message.text);
								break;
							case "info":
								$("#modalHostInfoBody").append(message.text);
								break;
							case "select":
							case "deselect":
								AFDCTRL.applyAliasSelect(message.action, message.alias);
								break;
						}
						break;
					default:
						break;
				}
			});
		},

		/**
		 *
		 */
		wsConnectionHeartbeat: function() {
			clearTimeout(AFDCTRL.ws.pingTimeout);
			AFDCTRL.ws.pingTimeout = setTimeout(function() {
				console.warn("Heartbeat timeout, closing WS.");
				AFDCTRL.ws.close();
			}, AFDUI.heartbeatInterval + 1000);
		},

		/**
		 *
		 */
		wsConnectionReconnect: function() {
			let retry = 0;
			if (AFDCTRL.reconnectInterval === null) {
				AFDCTRL.reconnectInterval = setInterval(function() {
					if (retry >= 10 && AFDCTRL.reconnectInterval !== null) {
						console.info("Re-connect failed.");
						clearInterval(AFDCTRL.reconnectInterval);
						AFDCTRL.reconnectInterval = null;
						alert(
							"AFD closed connection!\n\n"
							+ "Attempts (10) to reconnect failed.\n\n"
							+ "Please reload this page."
						);
						return;
					}
					retry++;
					console.info("Try to re-connect (#%d) ...", retry);
					AFDCTRL.wsConnectionOpen();
				}, AFDUI.heartbeatInterval);
			}
		},
		/**
         * 
         */
		wsConnctionClose: function() {
			const message = {
				user: "test",
				class: "fsa",
				command: "fsa",
				action: "stop"
			};
			AFDCTRL.ws.send(JSON.stringify(message));
			clearTimeout(AFDCTRL.ws.pingTimeout);
		},

		/*
         * ====================================================================
         * Methods building and sending commands to AFD.
         */
        /**
         * Send general AFD command.
         */
		wsCallAfdCmd: function(action, cmd) {
			const message = {
				user: "test",
				class: "afd",
				action: action,
				command: cmd
			};
			AFDCTRL.ws.send(JSON.stringify(message));
		},

        /**
         * Exec command for selected alias.
         * 
         * Expects empty response (http 204).
         */
		wsCallAliasCmd: function(action, aliasList) {
			if (!AFDCTRL.isAliasSelected(aliasList)) {
				return;
			}
			const al = aliasList.map(function(v) {
				return v.replace(/row-/, "");
			});
			console.log("callAliasCmd:", action, al);
			const message = {
				user: "test",
				class: "alias",
				action: action,
				alias: al
			};
			AFDCTRL.ws.send(JSON.stringify(message));
		},

        /**
         * Decide and exec command for selected alias.
         * 
         * Decission is made by testing if any of the nodes with ID from lookFor
         * has the corresponding class from testFor.
         */
		callAliasToggle: function(lookFor, testFor, swon, swoff, aliasList) {
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
				AFDCTRL.wsCallAliasCmd(sw, [alias]);
			});
		},

		/**
         * Open new window with command response.
         * 
         * Best suited for e.g. alias configuration.
         */
		openWindowPlaintext: function(title, text) {
			console.log("openWindowPlaintext: '%s' >>%s<<", title, text.substring(0, 100));
			window.open().document.write("<pre>" + text + "</pre>");
		},

		/**
         * Test if any alias is selected, popup alert if not.
         */
		isAliasSelected: function(aliasList) {
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
		/*
         * TODO: change rendering info. receive data as json and render template
         * in browser instead on server.
         */
		wsViewModalHostInfo: function(aliasList) {
			console.info("viewModalHostInfo:", aliasList);
			if (!AFDCTRL.isAliasSelected(aliasList)) {
				return;
			}
			$.each(aliasList, function(i, v) {
				let aliasName = v.replace(/row-/, "");
				const message = {
					user: "test",
					class: "alias",
					action: "info",
					command: "read",
					alias: aliasName
				};
				AFDCTRL.ws.send(JSON.stringify(message));
			});
			$("#modalHostInfo").modal("show");
		},

		/**
         * Remove host info from modal. Close modal if removing last info.
         */
		closeHostInfo: function(infoHost) {
			console.info("closeHostInfo:", infoHost);
			$("#hostInfoBox_" + infoHost).remove();
			if ($("#modalHostInfoBody").children().length == 0) {
				$("#modalHostInfo").modal("hide");
			} else {
				$("#modalHostInfo").modal("handleUpdate");
			}
		},

		/**
         * Send edited text for saving in INFO-file.
         */
		wsSaveHostInfoText: function(infoHost) {
			let infoText = $("#infoArea_" + infoHost)[0];
			console.info("saveHostInfoText", infoHost);
			const message = {
				user: "test",
				class: "alias",
				action: "info",
				command: "save",
				alias: infoHost,
				text: infoText.value
			};
			AFDCTRL.ws.send(JSON.stringify(message));
		},

		/*
         * ====================================================================
         * Methods for de-/select hosts.
         */
		/**
         * Show modal dialog for host selection.
         */
		viewModalSelect: function(aliasList) {
			console.debug("viewModalSelect:", aliasList);
			$("#modalSelect").modal("show");
		},

		/**
         * Close modal dialog.
         */
		closeModalSelect: function(infoHost) {
			console.debug("closeModalSelect:", infoHost);
			$("#modalSelect").modal("hide");
		},

		/**
         * Send selection criteria, select or de-select alias rows according the
         * returned list.
         */
		wsCallAliasSelect: function(cmd) {
			console.debug("callAliasSelect:");
			/* Declare and collect form parameters. */
			let paramSet = {
				what: cmd
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
			let message = {
				user: "test",
				class: "alias",
				action: paramSet.what,
				data: paramSet
			};
			AFDCTRL.ws.send(JSON.stringify(message));
		},

        /**
         * Select+deselect all hosts in returned lists.
         */
		applyAliasSelect: function(what, aliasList) {
			console.debug(status, what, aliasList);
			if (what === "select") {
				$.each(aliasList, function(i, v) {
					let row = $("#row-" + v);
					AFDCTRL.toggleMark(row, 1);
				});
			}
			else {
				$.each(aliasList, function(i, v) {
					let row = $("#row-" + v);
					AFDCTRL.toggleMark(row, -1);
				});
			}
		},

		/*
         * ====================================================================
         * Methods to load data and update display.
         */
		/**
         * Update on all aliases in afd_ctrl-window.
         * 
         * TODO: improve insert/remove of rows. Now rows are inserted/removed
         * with simple append/remove, changes in host-order are not reflected.
         */
		wsLoadData: function(data) {
			if (data.length < AFDCTRL.rowNum) {
				/*
                 * If display has more rows than in JSON, collect all alias-
                 * names and remove surplus rows.
                 */
				let dataAliasSet = {};
				$.each(data, function(i, v) {
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
			$.each(data, function(i, v) {
				if ($("#row-" + v.alias).length == 0) {
					/* If a alias in JSON is not in display, add new row. */
					AFDCTRL.addRow(AFDCTRL.rowNum, v);
					AFDCTRL.rowNum += 1;
				}
				/* Set row data. */
				AFDCTRL.setRowData(v);
			});
		},

		applyFsaData: function(data) {
			if (data["data"].length < AFDCTRL.rowNum) {
				/*
                 * If display has more rows than in JSON, collect all alias-
                 * names and remove surplus rows.
                 */
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
					/* If a alias in JSON is not in display, add new row. */
					AFDCTRL.addRow(AFDCTRL.rowNum, v);
					AFDCTRL.rowNum += 1;
				}
				/* Set row data. */
				AFDCTRL.setRowData(v);
			});
		},

		/**
         * Insert new alias row if yet not present in afd_ctrl-window.
         */
		addRow: function(rowNum, val) {
			/* Calculates the column in which the row should be placed. */
			let lastCol = Math.floor(rowNum / AFDCTRL.maxRowsPerCol);
			console.debug("rownum:", rowNum, "maxRowsPerCol:", AFDCTRL.maxRowsPerCol, "lastCol:", lastCol, "tabcol.len:",
				$(".tabcol").length);
			if ($(".tabcol").length <= lastCol) {
				/*
                 * If the row should be in column wich is not there yet, add a
                 * new column.
                 */
				let col = $("#template-tabcol").clone();
				col.attr("id", "tabcol-" + lastCol);
				col.addClass("tabcol");
				col.removeAttr("style");
				col.find("tbody").attr("id", "tbdy-" + lastCol);
				$("#tab-area").append(col);
			}
			/* Clone template row, set all values, and add to last column. */
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
		removeRow: function(rowAlias) {
			$("#" + rowAlias).remove();
			AFDCTRL.rowNum -= 1;
		},

		/**
         * Update all changed data in an alias row.
         */
		setRowData: function(val) {
			let key = null, j, jid, x, y, radd, rmod;
			let row = $("#row-" + val.alias);
			for (key in val) {
				if (key == "host_status") {
					/* Update host status if host in DIR_CONFIG ... */
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
						if (!row.children(".status-run").hasClass(status_str)) {
							/* Change class only if not already set. */
							row.children(".status-run").removeClass().addClass("alias status-run " + status_str);
						}
					} else { /* HOST_NOT_IN_DIR_CONFIG */
						row.children(".status-run").removeClass().addClass("alias status-run HOST_NOT_IN_DIR_CONFIG");
					}
					/* Update queue-LED ... */
					if (val.host_status.indexOf("PAUSE_QUEUE") >= 0) {
						row.children(".status-queue").removeClass().addClass("status-led status-queue PAUSE_QUEUE");
					} else if (val.host_status.indexOf("AUTO_PAUSE_QUEUE") >= 0) {
						row.children(".status-queue").removeClass()
							.addClass("status-led status-queue AUTO_PAUSE_QUEUE");
					} else {
						row.children(".status-queue").removeClass().addClass("status-led status-queue NORMAL_STATUS");
					}
				} else if (key == "debug_mode") {
					/* Update debug-LED ... */
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
					/* Update LEDs for receive and send ... */
					let status_transfer;
					if (val.host_status.indexOf("STOP_TRANSFER") >= 0) {
						status_transfer = "STOP_TRANSFER";
					} else {
						status_transfer = "TRANSFER_NORMAL";
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
					/* Set size of files currently transfered resp. in queue */
					row.children(".file_size").html(
						AFDCTRL.bytes_to_human_str(val.file_size)
					);
				} else if (key == "bytes_send") {
					/* Calculate and set transfer rate */
					let ftr = row.children(".transfer_rate").first();
					if (ftr.attr("bytes_send") == null) {
						ftr.attr("bytes_send", val.bytes_send);
					}
					row.children(".transfer_rate").html(
						AFDCTRL.bytes_to_human_str(
							(val.bytes_send - ftr.attr("bytes_send")) / (AFDCTRL.updateInterval / 1000)
						)
					);
					ftr.attr("bytes_send", val.bytes_send);
				} else if (key == "jobs") {
					/* For each job, set number of files in transfer. */
					j = -1;
					for (j in val.jobs) {
						jid = row.attr("id") + "_job_" + val.jobs[j].job_num;
						if ($("#" + jid).length == 0) {
							/*
                             * If display presents less jobs then there are, add
                             * one.
                             */
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
					// TODO: remove surplus jobs.
				} else {
					/* For all other keys, set text. */
					row.children("." + key).html(eval("val." + key));
				}
			}
		} /* setRowData */
	}; /* End returned object. */
}();

var AFDEDIT = function() {
	return {
		/** Hold Websocket connection. */
		ws: {},

        /**
         * Enable/disable form-input-tags which have CSS-class as filter.
         */
		ableAll: function(obj, class_filter) {
			console.debug("ableAll", class_filter);
			if (obj.type == "radio") {
				if (obj.value == "yes" && obj.checked == true) {
					$("." + class_filter).removeAttr("disabled");
				} else {
					$("." + class_filter).attr("disabled", true);
				}
			} else {
				if (obj.checked == true) {
					$("." + class_filter).removeAttr("disabled");
				} else {
					$("." + class_filter).attr("disabled", true);
				}
			}
		},

		dupcheck_defaults: function() {
			console.debug("dupcheck_defaults");
			$("#dupcheck_timeout")[0].value = "3600";
			$("#dupcheck_reference-alias")[0].checked = true;
			$("#dupcheck_type-name")[0].checked = true;
			$("#dupcheck_delete")[0].checked = true;
			$("#dupcheck_crc-crc32")[0].checked = true;
		},

        /**
         * Send host configuration data for the selected host for saving.
         */
		updateHostconfig: function() {
			console.info("updateHostconfig: selected alias:", $("#alias-list"));
			let alias = $("#alias-list")[0].value;
			if (alias == null || alias == "") {
				console.debug("nothing to do.");
				return;
			}
			let ol = $("#alias-list option");
			let aliasList = [];
			for (let i = 0; i < ol.length; i++) {
				aliasList.push(ol[i].value);
			}
			let formData = {
				order: aliasList,
				data: {}
			};
			formData["data"][alias] = {};
			$.each($(".filter"), function(i, obj) {
				if (obj.type == "radio") {
					if (obj.checked) {
						formData["data"][alias][obj.id.split("-", 1)[0]] = obj.value;
					}
				} else if (obj.type == "checkbox") {
					if (obj.checked) {
						formData["data"][alias][obj.id] = "yes";
					}
				} else {
					formData["data"][alias][obj.id] = obj.value;
				}
			});
			formData["data"][alias]["alias"] = alias;
			delete formData["data"][alias]["alias-list"];
			const message = {
				class: "afd",
				action: "hc",
				command: "save",
				alias: alias !== null ? [alias] : [],
				data: formData
			};
			console.debug(message);
			AFDEDIT.ws.send(JSON.stringify(message));
		},

        /**
         * Exec general AFD command, handle ajax call.
         */
		readHostconfig: function(alias) {
			console.debug("readHostconfig: " + alias);
			const message = {
				class: "afd",
				action: "hc",
				command: "read",
				alias: alias !== null ? [alias] : []
			};
			AFDEDIT.ws.send(JSON.stringify(message));
		},

        /**
         * Re-build the hostname list to reflect any change in the order.
         */
		changeHostconfigAliasList: function(aliasList, selectedAlias) {
			console.debug("changeHostconfigAliasList: " + aliasList + " - " + selectedAlias);
			let data = "";
			for (let i = 0; i < aliasList.length; i++) {
				if (aliasList[i] == selectedAlias) {
					data = data + "<option selected>" + aliasList[i] + "</option>";
				} else {
					data = data + "<option>" + aliasList[i] + "</option>";
				}
			}
			$("#alias-list").html(data);
		},

        /**
         * Update the form-input-tag values with retrieved values.
         */
		changeHostconfigFormValues: function(data, selectedAlias) {
			console.debug("changeHostconfigFormValues: " + selectedAlias);
			if (data[selectedAlias]["keep_connected_direction"] != "send"
				&& data[selectedAlias]["keep_connected_direction"] != "fetch") {
				data[selectedAlias]["keep_connected_direction"] = "both";
			}
			if (data[selectedAlias]["dupcheck_timeout"] == 0) {
				data[selectedAlias]["dupcheck_flag"] = "disable";
			} else {
				data[selectedAlias]["dupcheck_flag"] = "enable";
			}
			$.each(data[selectedAlias], function(k, v) {
				let objList = $("[name=" + k + "]");
				if (objList.length > 0) {
					if (objList[0].type == "radio") {
						objList = $("#" + k + "-" + v);
						if (objList.length > 0) {
							objList[0].checked = true;
						}
					} else if (objList[0].type == "checkbox") {
						objList = $("#" + k);
						if (objList.length > 0 && v == "yes") {
							objList[0].checked = true;
						} else {
							objList[0].checked = false;
						}
					} else {
						objList[0].value = v;
					}
				}
			});
			AFDEDIT.ableAll($("#host_switch_enable")[0], "host_switch");
			AFDEDIT.ableAll($("#dupcheck_flag-enable")[0], "dupcheck");
		},

        /**
         * Move a hostname up/down in the hostname-list.
         */
		moveHostconfigAlias: function(direction) {
			console.debug("moveHostconfigAlias", direction);
			let alias = $("#alias-list")[0].value;
			if (!alias) {
				return;
			}
			let aliasList = $("#alias-list option");
			console.debug("aliasList -------");
			$.each(aliasList, function(i, v) {
				console.debug(v.value);
			});
			let is = 0;
			let ie = aliasList.length;
			if (direction == -1) {
				is = 1;
			} else if (direction == 1) {
				ie = ie - 1;
			}
			for (let i = is; i < ie; i++) {
				console.debug("test", i, aliasList[i].value)
				if (alias == aliasList[i].value) {
					if (direction) {
						console.debug("move", i, aliasList[i].value);
						let buf = aliasList[i];
						aliasList[i] = aliasList[i + direction];
						aliasList[i + direction] = buf;
					} else {
						aliasList.splice(i, 1);
					}
					$("#alias-list").html(aliasList);
					break;
				}
			}
			console.debug("aliasList -------");
			$.each(aliasList, function(i, v) {
				console.debug(v.value);
			});
		},

		wsConnectionOpen: function() {
			AFDEDIT.ws = new WebSocket(
				AFDUI.urlWsProto + "//" + AFDUI.urlBase + "/ctrl",
				["json"]
			);
			AFDEDIT.ws.addEventListener("open", function() {
				console.info("ws-connection open");
				if (window.location.pathname.endsWith("afd-hcedit.html")) {
					/*
					 * Document-ready actions for Host-Config-Editor.
					 */
					if (window.location.search != "") {
						/*
						 * In case there"s "?<alias>" in URL, load this alias ...
						 */
						let al = window.location.search.substring(1).split(",");
						AFDEDIT.readHostconfig(al[0]);
					} else {
						/*
						 * ... otherwise load the first one.
						 */
						AFDEDIT.readHostconfig(null);
					}
				} else {
					alert("Why is there no DIR_CONFIG editor???");
				}
			});
			AFDEDIT.ws.addEventListener("close", function() {
				alert("AFD closed connection!");
			});
			AFDEDIT.ws.addEventListener("error", function(event) {
				// error handler -> reconnect.
				console.warn(event);
			});
			AFDEDIT.ws.addEventListener("message", function(event) {
				const message = JSON.parse(event.data);
				console.debug(message);
				/* evaluate incoming message */
				if (message.class == "afd" && message.action == "hc") {
					AFDEDIT.changeHostconfigAliasList(message.order, message.alias);
					if (message.alias != null && message.alias != "") {
						AFDEDIT.changeHostconfigFormValues(message.data, message.alias);
					} else {
						AFDEDIT.changeHostconfigFormValues(message.data, message.order[0]);
					}
				}
			});
		},

		/**
         * 
         */
		wsConnctionClose: function() {
			console.info("AFD closed ws connection.");
			alert(
				"AFD closed connection!\n\n"
				+ "Attempts (10) to reconnect failed.\n\n"
				+ "Please reload this page."
			);
		}

	}; /* End returned object. */
}();

var AFDLOG = function() {
	return {
		/** selectedLogAreaLines. */
		selectedLogAreaLines: {},

		wsConnectionOpen: function() {
			AFDLOG.ws = new WebSocket(
				AFDUI.urlWsProto + "//" + AFDUI.urlBase + "/log",
				["json"]
			);
			AFDLOG.ws.addEventListener("open", function() {
				console.info("ws-connection open");
			});
			AFDLOG.ws.addEventListener("close", function() {
				alert("AFD closed connection!");
			});
			AFDLOG.ws.addEventListener("error", function(event) {
				// error handler -> reconnect.
				console.warn(event);
			});
			AFDLOG.ws.addEventListener("message", function(event) {
				const message = JSON.parse(event.data);
				console.debug(message);
				/* evaluate incoming message */
				if (message.class == "log") {
					switch (message.action) {
						case "list":
							const context = $("#" + message.context + "-area");
							if (message.append) {
								// TODO append or replace lines.
							}
							if ("lines" in message) {
								context.html(message.lines);
							}
							else {
								context.html(message.text);
							}
							context.find("tr").on("click", function(event) {
								$(this).toggleClass("selected");
							});
							$("." + message.context + "-area-scroll").scrollTop($(this)[0].scrollHeight);
							/* TODO progress-swirl? */
							$("#" + message.context + " *").css({
								"cursor": "auto"
							});
							break;
						case "info":
							$("#modalFileInfoBody").append(message.data.text);
							break;
					}
				}
			});
		},

		/**
         * 
         */
		wsConnctionClose: function() {
			console.info("AFD closed ws connection.");
			alert(
				"AFD closed connection!\n\n"
				+ "Attempts (10) to reconnect failed.\n\n"
				+ "Please reload this page."
			);
		},

        /**
         * Retrieve full log-file content (e.g. system-log, transfer-log).
         */
		callAldaLevel: function(logName) {
			console.debug("callAldaLevel " + logName);
			var transl = {
				info: "I",
				config: "C",
				warn: "W",
				error: "E",
				offline: "O",
				debug: "D"
			};
			let levelList = [];
			$.each($("#" + logName + " ." + logName + "-level"), function(i, v) {
				if (v.checked) {
					levelList.push(transl[v.value]);
				}
			});
			if (levelList.length == 0) {
				alert("Select at least one log-level!");
				return false;
			}
			let fileNumber = $("#" + logName + "-logfile").get(0).value;
			const msg = {
				class: "log",
				context: logName,
				action: "list",
				filter: {
					file: fileNumber,
					level: levelList.join("|")
				}
			}
			console.debug(msg);
			AFDLOG.ws.send(JSON.stringify(msg));
		},

        /**
         * Retrieve log information with ALDA.
         */
		callAldaFilter: function(logName) {
			console.debug("callAldaFilter " + logName);
			let paramSet = {};
			$("#" + logName + " *").css({
				"cursor": "progress"
			});
			$.each($("#" + logName + " .filter"), function(i, obj) {
				if (obj.type == "checkbox") {
					if (obj.checked == true) {
						paramSet[obj.name] = obj.value;
					}
				} else if (obj.value != "") {
					paramSet[obj.name] = obj.value;
				}
			});
			const msg = {
				class: "log",
				context: logName,
				action: "list",
				filter: paramSet
			};
			console.debug(msg);
			AFDLOG.ws.send(JSON.stringify(msg));
		},

		/**
		 * Set input fields for start- and end-time according to range.
		 */
		setDate: function(logName, timeRange) {
			console.debug("setDate", logName, timeRange);
			if (timeRange == "clear") {
				$("#" + logName + " .filter[name=start]").val("");
				$("#" + logName + " .filter[name=end]").val("");
				return;
			}
			let dateStart = "";
			let dateEnd = "";
			let now = new Date(Date.now());
			let datetimeNowMonth = now.getMonth() + 1;
			let datetimeNowDay = now.getDate();
			let datetimeNowHour = now.getHours();
			let datetimeNowMinute = now.getMinutes();
			let yday = new Date(Date.now());
			yday.setDate(now.getDate() - 1);
			let datetimeYdayMonth = yday.getMonth() + 1;
			let datetimeYdayDay = yday.getDate();
			if (datetimeNowMonth < 10) {
				datetimeNowMonth = '0' + datetimeNowMonth;
			}
			if (datetimeNowDay < 10) {
				datetimeNowDay = '0' + datetimeNowDay;
			}
			if (datetimeNowHour < 10) {
				datetimeNowHour = '0' + datetimeNowHour;
			}
			if (datetimeNowMinute < 10) {
				datetimeNowMinute = '0' + datetimeNowMinute;
			}
			if (datetimeYdayMonth < 10) {
				datetimeYdayMonth = '0' + datetimeYdayMonth;
			}
			if (datetimeYdayDay < 10) {
				datetimeYdayDay = '0' + datetimeYdayDay;
			}
			if (timeRange == "today") {
				dateStart = "" + datetimeNowMonth + datetimeNowDay + "0000";
				dateEnd = "" + datetimeNowMonth + datetimeNowDay + datetimeNowHour + datetimeNowMinute;
			} else if (timeRange == "yesterday") {
				dateStart = "" + datetimeYdayMonth + datetimeYdayDay + "0000";
				dateEnd = "" + datetimeNowMonth + datetimeNowDay + "0000";
			}
			$("#" + logName + " .filter[name=start]").val(dateStart);
			$("#" + logName + " .filter[name=end]").val(dateEnd);
			console.debug(dateStart, dateEnd);
		},

		/**
		 * Remove class from all selected log-lines.
		 */
		unselectLogLines: function(logName) {
			$("#" + logName + "-area").find("tr.selected").toggleClass("selected");
		},

		/**
		 * Show or hide modal with selection form.
		 */
		toggleModal: function(modal) {
			$.each($("#" + modal + " input.form-check-input"), function(i, obj) {
				if (obj.checked == true) {
					obj.checked = false;
				} else {
					obj.checked = true;
				}
			});
		},

		/**
		 * Update selection form in modal on any change, for event-handler.
		 */
		updateModal: function(modalId) {
			let checkedList = [];
			$.each($("#" + modalId + " .form-check-input"), function(i, obj) {
				if (obj.checked) {
					checkedList.push(obj.value);
				}
			});
			$("#" + modalId + "Value").attr("value", checkedList.join(","));
		},

		/**
         * Remove host info from modal. Close modal if removing last info.
         */
		closeFileInfo: function(fileInfo) {
			console.info("closeFileInfo:", fileInfo);
			$("#fileInfoBox_" + fileInfo).remove();
			if ($("#modalFileInfoBody").children().length == 0) {
				$("#modalFileInfo").modal("hide");
			} else {
				$("#modalFileInfo").modal("handleUpdate");
			}
		},

		/**
		 *
		 */
		callFileInfo: function(logName) {
			console.debug("callFileInfo", logName);
			let selectedLogAreaLines = [];
			$.each($("#" + logName + " .selected"), function(i, obj) {
				selectedLogAreaLines.push({
					jsid: obj.attributes["jsid"].value,
					file: obj.childNodes[2].innerText
				});
			});
			if (selectedLogAreaLines.length == 0) {
				alert("Select at least log entry first!");
				return;
			}
			const msg = {
				class: "log",
				context: logName,
				action: "info",
				filter: selectedLogAreaLines
			};
			console.debug("send message", msg);
			AFDLOG.ws.send(JSON.stringify(msg));
			$("#modalFileInfo").modal("show");
		},

		/**
		 * View file content for each selected one in a new window.
		 */
		callView: function(logName) {
			console.debug("callView " + logName);
			let selectedLogAreaLines = [];
			$.each($("#" + logName + " .selected"), function(i, obj) {
				if (obj.childNodes[obj.childElementCount - 1].innerText == "Y") {
					selectedLogAreaLines.push(obj.attributes["archive"].value);
				}
			});
			if (selectedLogAreaLines.length == 0) {
				alert("Select archived log entry first!");
				return;
			}
			let mode = $("#" + logName + "-view-mode").text().split(" ")[1].toLowerCase();
			console.debug("view", mode, selectedLogAreaLines);
			$.each(selectedLogAreaLines, function(i, v) {
				window.open(AFDUI.urlViewProto + "//" + AFDUI.urlBase + "/view/" + mode + "/" + v);
			});
		}

	}; /* End returned object. */
}();

