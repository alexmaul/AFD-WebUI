var AFDEDIT = function() {
    return {
        /** urlBase. */
        urlBase : "/",

        /** urlView. */
        urlHc: "afd/hc/",

        /**
         * 
         */
        ableAll : function(obj, class_filter) {
            console.log("ableAll", obj, class_filter);
            if (obj.type == "radio") {
                if (obj.value == "yes") {
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

        /**
         * Exec general AFD command, handle ajax call.
         */
        readHostconfig : function(alias) {
            console.log("readHostconfig: " + alias);
            $.ajax({
                type : "GET",
                url : AFDEDIT.urlBase + AFDEDIT.urlHc + alias,
                success : function(data, status, jqxhr) {
                    console.log(status);
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

    }; /* End returned object. */
}();

(function() {
    $(document).ready(function() {
    });
})();
