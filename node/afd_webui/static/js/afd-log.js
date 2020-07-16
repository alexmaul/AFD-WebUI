"use strict";
/**
 */
var AFDLOG = function() {
	return {
		/** urlBase. */
		urlBase: "localhost:8040",

		/** selectedLogAreaLines. */
		selectedLogAreaLines: {},

		wsConnectionOpen: function() {
			AFDLOG.ws = new WebSocket("ws://" + AFDLOG.urlBase + "/log", ["json"]),
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
					let context = $("#" + message.context + "-area");
					if (message.append) {
						// TODO append or replace lines.
					}
					context.html(data);
					context.find("tr").on("click", function(event) {
						context.toggleClass("selected");
					});
					$("." + message.context + "-area-scroll").scrollTop($(this)[0].scrollHeight);
					/* TODO progress-swirl?
					$("#" + message.context + " *").css({
                        "cursor" : "auto"
                    });
					*/
				}
			});
		},

		/**
         * 
         */
		wsConnctionClose: function() {
			console.debug("close ws connection.");
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
			AFDLOG.ws.send({
				class: "log",
				context: logName,
				filter: {
					file: fileNumber,
					level: levelList.join("|")
				}
			});
		},

        /**
         * Retrieve log information with ALDA.
         */
		callAldaFilter: function(logName) {
			console.debug("callAldaFilter " + logName);
			let paramSet = {};
			$.each($("#" + logName + " .filter"), function(i, obj) {
				if (obj.type == "checkbox") {
					if (obj.checked == true) {
						paramSet[obj.name] = obj.value;
					}
				} else if (obj.value != "") {
					paramSet[obj.name] = obj.value;
				}
			});
			console.debug(paramSet);
			AFDLOG.ws.send({
				class: "log",
				context: logName,
				filter: paramSet
			});
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
				window.open("http://" + AFDLOG.urlBase + "/view/" + mode + "/" + v);
			});
		}
	}; /* End returned object. */
}();

(function() {
	$(document).ready(
		function() {
			/*
			 * Activate tab if url-anchor is set.
			 */
			console.debug(window.location);
			if (window.location.hash != "") {
				console.debug("found anchor: " + window.location.hash);
				$(window.location.hash + "-tab").tab("show");
			}
			/*
			 * Pre-set input field "Recipient" if "?..." is set in URL.
			 */
			if (window.location.search != "") {
				console.debug("found query: " + window.location.search);
				$("#" + window.location.hash.substring(1) + " .filter[name=recipient]").val(
					window.location.search.substring(1));
			}
			/*
			 * Set update function for modal events.
			 */
			let modalList = ["modalProtocol", "modalDelete"];
			for (let i = 0; i < modalList.length; i++) {
				$("#" + modalList[i]).on("hide.bs.modal", function(event) {
					AFDLOG.updateModal(event.target.id);
				});
				AFDLOG.updateModal(modalList[i]);
			}
			AFDLOG.urlBase = window.location.host;
			AFDLOG.wsConnectionOpen();
			$(document).on("close", function(event) {
				AFDLOG.wsConnctionClose();
			});
		});
})();
