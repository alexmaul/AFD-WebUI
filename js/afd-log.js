var AFDLOG = function() {
    return {
        urlBase : "http://localhost:8040/",

        callAldaCmd : function(ctx, paramSet) {
            /*
             * Exec general AFD command, handle ajax call.
             */
            console.log("callAldaCmd: " + ctx + ": " + paramSet);
            $.ajax({
                type : "POST",
                url : AFDLOG.urlBase + "alda/" + ctx,
                data : paramSet,
                success : function(data, status, jqxhr) {
                    console.log(status);
                    console.log(this);
                    $(this).text(data);
                    $(this).scrollTop($(this)[0].scrollHeight);
                },
                error : function(status, jqxhr) {
                    console.log(status, jqxhr);
                },
                context : $("#" + ctx + "_area")
            });
        },

        callAldaLevel : function(log_name) {
            /*
             * Retrieve full log-file content (e.g. system-log, transfer-log).
             */
            console.log("callAldaLevel " + log_name);
            var transl = {
                info : "I",
                config : "C",
                warn : "W",
                error : "E",
                offline : "O",
                debug : "D",
            };
            var filter = [];
            $.each($("#" + log_name + " ." + log_name + "_level"), function(i, v) {
                if (v.checked) {
                    filter.push(transl[v.value]);
                }
            });
            if (filter.length == 0) {
                alert("Check at least one log-level!");
                return false;
            }
            var file_number = $("#" + log_name + "_logfile").get(0).value;
            AFDLOG.callAldaCmd(log_name, {
                file : file_number,
                filter : filter.join("|")
            });
        },

        callAldaFilter : function(log_name) {
            /*
             * Retrieve log information with ALDA.
             */
            console.log("callAldaFilter " + log_name);
            var paramSet = {};
            console.log($("#" + log_name + " .filter"));
            $.each($("#" + log_name + " .filter"), function(i, obj) {
                for (var j = 0; j < obj.classList.length; j++) {
                    if (obj.classList[j] != "filter" && obj.value != "") {
                        console.log("#" + log_name + ": " + j + ": " + obj.classList[j]);
                        paramSet[obj.classList[j]] = obj.value;
                    }
                }
            });
            console.log(paramSet);
            AFDLOG.callAldaCmd(log_name, paramSet);
        },

        setDate : function(log_name, time_range) {
            /*
             * Set input fields for start- and end-time according to range.
             */
            console.log("setDate " + log_name);
            var val_start = "";
            var val_end = "";
            var now = new Date(Date.now());
            var ta_mo = now.getMonth() + 1;
            var ta_dd = now.getDate();
            var ta_hh = now.getHours();
            var ta_mi = now.getMinutes();
            var yday = new Date(Date.now());
            yday.setDate(now.getDate() - 1);
            var tb_mo = yday.getMonth() + 1;
            var tb_dd = yday.getDate();
            var tb_hh = yday.getHours();
            var tb_mi = yday.getMinutes();
            if (ta_mo < 10) {
                ta_mo = '0' + ta_mo;
            }
            if (ta_dd < 10) {
                ta_dd = '0' + ta_dd;
            }
            if (ta_hh < 10) {
                ta_hh = '0' + ta_hh;
            }
            if (ta_mi < 10) {
                ta_mi = '0' + ta_mi;
            }
            if (tb_mo < 10) {
                tb_mo = '0' + tb_mo;
            }
            if (tb_dd < 10) {
                tb_dd = '0' + tb_dd;
            }
            if (tb_hh < 10) {
                tb_hh = '0' + tb_hh;
            }
            if (tb_mi < 10) {
                tb_mi = '0' + tb_mi;
            }
            if (time_range == "today") {
                val_start = "" + ta_mo + ta_dd + "0000";
                val_end = "" + ta_mo + ta_dd + ta_hh + ta_mi;
            } else if (time_range == "yesterday") {
                val_start = "" + tb_mo + tb_dd + "0000";
                val_end = "" + ta_mo + ta_dd + "0000";
            }
            $("#" + log_name + " .start").val(val_start);
            $("#" + log_name + " .end").val(val_end);
            console.log(val_start, val_end);
        }
    };
}();

(function() {
    $(document).ready(function() {
        // Activate tab if url-anchor is set.
        console.log(window.location);
        if (window.location.hash != "") {
            console.log("found anchor: " + window.location.hash);
            $(window.location.hash + "-tab").tab("show");
        }
    });
})();
