var AFDLOG = function() {
    return {
        urlBase : "http://localhost:4080/",
        callAldaCmd : function(ctx, cmd) {
            /*
             * Exec general AFD command, handle ajax call.
             */
            console.log("callAldaCmd: " + ctx + ": " + cmd);
            $.ajax({
                type : "GET",
                url : AFDLOG.urlBase + "alda",
                data : cmd,
                success : function(data, status, jqxhr) {
                    console.log(status);
                    console.log(this);
                    $(this).text(data);
                    $(this).scrollTop($(this)[0].scrollHeight);
                },
                context : $("#" + ctx)
            });
        },
        callAldaLevel : function(log_name) {
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
            AFDLOG.callAldaCmd(log_name + "_area", "type=" + log_name + ";file=" + file_number + ";filter="
                    + filter.join("|"));
        },
        callAldaFilter : function(log_name) {
            console.log("callAldaFilter " + log_name);
            ;
        }
    };
}();
