var AFDLOG = function() {
    return {
        /** urlBase. */
        urlBase : "/",

        /** urlView. */
        urlView : "view/",

        /** urlLog. */
        urlLog : "log/",

        /** selectedLogAreaLines. */
        selectedLogAreaLines : {},

        /**
         * Exec general AFD command, handle ajax call.
         */
        callAldaCmd : function(ctx, paramSet) {
            console.log("callAldaCmd: " + ctx + ": " + paramSet);
            $("#" + ctx + " .log_content-area-scroll .spinner-border").removeClass("d-none");
            $.ajax({
                type : "POST",
                url : AFDLOG.urlBase + AFDLOG.urlLog + ctx,
                data : paramSet,
                success : function(data, status, jqxhr) {
                    console.log(ctx, status);
                    $(this).html(data);
                    $(this).find("tr").on("click", function(event) {
                        $(this).toggleClass("selected");
                    });
                    $(this).scrollTop($(this)[0].scrollHeight);
                },
                error : function(status, jqxhr) {
                    console.log(status, jqxhr);
                },
                complete : function(a, b) {
                    $("#" + ctx + " .log_content-area-scroll .spinner-border").addClass("d-none");
                },
                context : $("#" + ctx + "-area")
            });
        },

        /**
         * Retrieve full log-file content (e.g. system-log, transfer-log).
         */
        callAldaLevel : function(logName) {
            console.log("callAldaLevel " + logName);
            var transl = {
                info : "I",
                config : "C",
                warn : "W",
                error : "E",
                offline : "O",
                debug : "D",
            };
            let filter = [];
            $.each($("#" + logName + " ." + logName + "-level"), function(i, v) {
                if (v.checked) {
                    filter.push(transl[v.value]);
                }
            });
            if (filter.length == 0) {
                alert("Check at least one log-level!");
                return false;
            }
            let fileNumber = $("#" + logName + "-logfile").get(0).value;
            AFDLOG.callAldaCmd(logName, {
                file : fileNumber,
                filter : filter.join("|")
            });
        },

        /**
         * Retrieve log information with ALDA.
         */
        callAldaFilter : function(logName) {
            console.log("callAldaFilter " + logName);
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
            console.log(paramSet);
            AFDLOG.callAldaCmd(logName, paramSet);
        },

        /**
         * 
         */
        toggleModal : function(modal) {
            $.each($("#" + modal + " input.form-check-input"), function(i, obj) {
                if (obj.checked == true) {
                    obj.checked = false;
                } else {
                    obj.checked = true;
                }
            });
        },

        /**
         * Set input fields for start- and end-time according to range.
         */
        setDate : function(logName, timeRange) {
            console.log("setDate", logName, timeRange);
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
            console.log(dateStart, dateEnd);
        },

        /**
         * 
         */
        updateModal : function(modalId) {
            let checkedList = [];
            $.each($("#" + modalId + " .form-check-input"), function(i, obj) {
                if (obj.checked) {
                    checkedList.push(obj.value);
                }
            });
            $("#" + modalId + "Value").attr("value", checkedList.join(","));
        },

        /**
         * 
         */
        callView : function(logName) {
            console.log("callView " + logName);
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
            mode = $("#" + logName + "-view-mode").text().split(" ")[1].toLowerCase();
            console.log("view", mode, selectedLogAreaLines);
            $.each(selectedLogAreaLines, function(i, v) {
                window.open(AFDLOG.urlBase + AFDLOG.urlView + mode + "/" + v);
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
                console.log(window.location);
                if (window.location.hash != "") {
                    console.log("found anchor: " + window.location.hash);
                    $(window.location.hash + "-tab").tab("show");
                }
                /*
                 * Pre-set input field "Recipient" if "?..." is set in URL.
                 */
                if (window.location.search != "") {
                    console.log("found query: " + window.location.search);
                    $("#" + window.location.hash.substring(1) + " .filter[name=recipient]").val(
                            window.location.search.substring(1));
                }
                /*
                 * Set update function for modal events.
                 */
                let modalList = [ "modalProtocol", "modalDelete" ];
                for (let i = 0; i < modalList.length; i++) {
                    $("#" + modalList[i]).on("hide.bs.modal", function(event) {
                        AFDLOG.updateModal(event.target.id);
                    });
                    AFDLOG.updateModal(modalList[i]);
                }
            });
})();
