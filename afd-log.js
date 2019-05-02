var AFDLOG = function() {
    return {
        callAldaCmd : function(cmd) {
            /*
             * Exec general AFD command, handle ajax call.
             */
            console.log("callAfdCmd: ", cmd);
            $.ajax({
                type : "GET",
                url : AFDCTRL.urlBase + "cmd",
                data : cmd,
                success : function(a, b, c) {
                    console.log(a + b + c);
                }
            });
        },
        callAldaLevel : function(log_name) {
            console.log("callAldaLevel " + log_name);
            param=[];
            $.each($("#" + log_name + " ." + log_name + "_level"), function(i, v) {
                v.value + "=" + v.checked;
            });
            ;
        },
        callAldaFilter : function(log_name) {
            console.log("callAldaFilter " + log_name);
            ;
        }
    };
}();
