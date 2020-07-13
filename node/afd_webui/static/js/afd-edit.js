"use strict";
var AFDEDIT = function() {
	return {
		/** urlBase. */
		urlBase: "/",

		/** urlView. */
		urlHc: "afd/hc",

		/** Hold Websocket connection. */
		ws: {},
        /**
         * Enable/disable form-input-tags which have CSS-class as filter.
         */
		ableAll: function(obj, class_filter) {
			console.log("ableAll", class_filter);
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
			console.log("dupcheck_defaults");
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
			console.log("updateHostconfig");
			console.log("selected alias:", $("#alias-list"));
			let alias = $("#alias-list")[0].value;
			if (alias == null || alias == "") {
				console.log("nothing to do.");
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
			console.log(message);
			AFDEDIT.ws.send(JSON.stringify(message));
		},

        /**
         * Exec general AFD command, handle ajax call.
         */
		readHostconfig: function(alias) {
			console.log("readHostconfig: " + alias);
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
			console.log("changeHostconfigAliasList: " + aliasList + " - " + selectedAlias);
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
			console.log("changeHostconfigFormValues: " + selectedAlias);
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
			console.log("moveHostconfigAlias", direction);
			let alias = $("#alias-list")[0].value;
			if (!alias) {
				return;
			}
			let aliasList = $("#alias-list option");
			console.log("aliasList -------");
			$.each(aliasList, function(i, v) {
				console.log(v.value);
			});
			let is = 0;
			let ie = aliasList.length;
			if (direction == -1) {
				is = 1;
			} else if (direction == 1) {
				ie = ie - 1;
			}
			for (let i = is; i < ie; i++) {
				console.log("test", i, aliasList[i].value)
				if (alias == aliasList[i].value) {
					if (direction) {
						console.log("move", i, aliasList[i].value);
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
			console.log("aliasList -------");
			$.each(aliasList, function(i, v) {
				console.log(v.value);
			});
		},

		wsConnectionOpen: function() {
			AFDEDIT.ws = new WebSocket('ws://localhost:8040', ['json']),
				AFDEDIT.ws.addEventListener('open', function() {
					console.log("ws-connection open");
					if (window.location.pathname.endsWith("afd-hcedit.html")) {
						/*
						 * Document-ready actions for Host-Config-Editor.
						 */
						if (window.location.search != "") {
							/*
							 * In case there's "?<alias>" in URL, load this alias ...
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
			AFDEDIT.ws.addEventListener('message', function(event) {
				const message = JSON.parse(event.data);
				console.log(message);
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
		}

	}; /* End returned object. */
}();

(function() {
	$(document).ready(function() {
		console.log(window.location);
		if (!String.prototype.hasOwnProperty("endsWith")) {
			console.log("IE<12: mock-up endsWith()");
			String.prototype.endsWith = function(suffix) {
				return this.indexOf(suffix, this.length - suffix.length) !== -1;
			};
		}
        /*
         * Set interval-handler to regularly load data and update display.
         */
		AFDEDIT.wsConnectionOpen();
		$(document).on("close", function(event) {
			AFDEDIT.wsConnctionClose();
		});
	});
})();
